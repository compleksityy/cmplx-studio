import { ipcMain, IpcMainInvokeEvent } from 'electron';
import type { ChatMessage, OllamaModel } from '../shared/types';

// The Ollama service runs entirely in the main process and reaches the
// local server over Node's fetch, which has no CORS restrictions. Streaming
// chunks and the final result are pushed to the renderer over IPC events.

let activeController: AbortController | null = null;

export function cancelOllama(): void {
  if (activeController) {
    activeController.abort();
    activeController = null;
  }
}

async function request<T>(endpoint: string, path: string, init?: RequestInit): Promise<T> {
  const url = endpoint.replace(/\/+$/, '') + path;
  const res = await fetchWithEndpointFallback(url, init);
  if (!res.ok) {
    throw new Error(`Ollama returned ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

// Electron's Chromium fetch does not reliably reach `http://localhost` on the
// user's machine (it can resolve to an unreachable IPv6 address), even though
// the very same endpoint works from a terminal (curl). To make a configured
// `localhost` endpoint work inside the app, we fall back to the loopback
// aliases `127.0.0.1` and `[::1]` whenever a connection to the configured
// host fails. This preserves the user's setting while fixing discovery.
function endpointVariants(url: string): string[] {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^\[|\]$/g, '');
    const aliases: string[] = [url];
    const base = (h: string) => {
      const nu = new URL(url);
      const hostLiteral = h.includes(':') ? `[${h}]` : h;
      nu.host = u.port ? `${hostLiteral}:${u.port}` : hostLiteral;
      return nu.toString();
    };
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '0.0.0.0') {
      if (host !== '127.0.0.1') aliases.push(base('127.0.0.1'));
      if (host !== 'localhost') aliases.push(base('localhost'));
      if (host !== '::1') aliases.push(base('::1'));
    }
    // de-duplicate
    return [...new Set(aliases).values()];
  } catch {
    return [url];
  }
}

async function fetchWithEndpointFallback(input: string, init?: RequestInit): Promise<Response> {
  const variants = endpointVariants(input);
  let lastError: Error | null = null;
  for (const variant of variants) {
    try {
      const res = await fetch(variant, init);
      // A non-connection HTTP error (4xx/5xx) is authoritative — return it
      // rather than trying a different alias.
      if (res.ok || res.status >= 400) {
        return res;
      }
    } catch (e: any) {
      lastError = e;
    }
  }
  throw lastError ?? new Error('fetch failed');
}

export async function checkOllama(endpoint: string): Promise<boolean> {
  try {
    const url = endpoint.replace(/\/+$/, '') + '/api/version';
    const variants = endpointVariants(url);
    for (const variant of variants) {
      try {
        const res = await fetch(variant, { signal: AbortSignal.timeout(4000) });
        if (res.ok) return true;
      } catch {
        /* try next alias */
      }
    }
    return false;
  } catch {
    return false;
  }
}

export async function listModels(endpoint: string): Promise<OllamaModel[]> {
  const data = await request<{ models?: OllamaModel[] }>(endpoint, '/api/tags');
  return data.models || [];
}

interface ChatChunk {
  model?: string;
  message?: { content?: string; role?: string };
  done?: boolean;
  error?: string;
}

/**
 * Stream a chat completion to the renderer.
 * `emit` is called once per content delta (via webContents.send).
 * Resolves with the message id the renderer should append.
 * Throws on connection/protocol errors so the renderer can surface them.
 */
export async function streamChat(
  endpoint: string,
  model: string,
  messages: ChatMessage[],
  emit: (delta: string) => void,
  projectContext?: string
): Promise<void> {
  activeController = new AbortController();
  const url = endpoint.replace(/\/+$/, '') + '/api/chat';

  const payload: Record<string, unknown> = {
    model,
    stream: true,
    messages: messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role, content: m.content }))
  };

  if (projectContext && projectContext.trim()) {
    payload.messages = [
      {
        role: 'system',
        content:
          'You are CMPLX Studio\'s coding assistant, embedded in a project. Below is the current project context (file tree and open-file contents). Use it to give accurate, concrete answers and generate code that fits the repository.\n\n--- PROJECT CONTEXT ---\n' +
          projectContext
      },
      ...(payload.messages as ChatMessage[])
    ];
  }

  const res = await fetchWithEndpointFallback(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: activeController.signal
  });

  if (!res.ok || !res.body) {
    // Try to read an error body for a useful message.
    let detail = `Ollama returned ${res.status}`;
    try {
      const text = await res.text();
      if (text) detail = text.slice(0, 400);
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const flushLine = async (line: string) => {
    if (!line.trim()) return;
    try {
      const parsed = JSON.parse(line) as ChatChunk;
      if (parsed.error) throw new Error(parsed.error);
      const delta = parsed.message?.content;
      if (delta) emit(delta);
    } catch (e) {
      if (e instanceof Error) throw e;
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        await flushLine(line);
      }
    }
    if (buffer.trim()) await flushLine(buffer);
  } finally {
    activeController = null;
    reader.releaseLock();
  }
}

export function registerOllamaHandlers(getWindow: () => Electron.BrowserWindow | null): void {
  ipcMain.handle('ollama:check', async (_e: IpcMainInvokeEvent, { endpoint }: { endpoint: string }) => {
    try {
      return { ok: true, value: await checkOllama(endpoint) };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('ollama:listModels', async (_e: IpcMainInvokeEvent, { endpoint }: { endpoint: string }) => {
    try {
      return { ok: true, value: await listModels(endpoint) };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('ollama:cancel', () => {
    cancelOllama();
    return { ok: true, value: null };
  });

  ipcMain.handle(
    'ollama:chat',
    async (
      _e: IpcMainInvokeEvent,
      { endpoint, model, messages, projectContext }: { endpoint: string; model: string; messages: ChatMessage[]; projectContext?: string }
    ) => {
    const win = getWindow();
    if (!win) return { ok: false, error: 'No window available' };

    const emit = (delta: string) => {
      win.webContents.send('ollama:stream', { delta });
    };

    const handleAbort = () => {
      try {
        // Send an empty delta so the renderer stops its loading state even on cancel.
        win.webContents.send('ollama:stream', { delta: '', done: true, cancelled: true });
      } catch {
        /* ignored */
      }
    };

    try {
      await streamChat(endpoint, model, messages, emit, projectContext);
      win.webContents.send('ollama:stream', { delta: '', done: true });
      return { ok: true, value: null };
    } catch (err: any) {
      if (err.name === 'AbortError') {
        handleAbort();
        return { ok: true, value: null };
      }
      win.webContents.send('ollama:stream', { delta: '', done: true, error: err.message });
      return { ok: false, error: err.message };
    }
  });
}