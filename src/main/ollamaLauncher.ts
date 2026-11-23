import { ipcMain } from 'electron';
import { spawn, ChildProcess } from 'child_process';
import net from 'net';
import fs from 'fs';

// Manages the lifetime of a locally-installed Ollama service. CMPLX Studio
// can start Ollama when it is stopped, re-detect an already-running instance,
// and fall back to an alternative port if the default (11434) is occupied by
// another application. CMPLX Studio only ever terminates an instance that IT
// started; a pre-existing Ollama is never killed.

export const DEFAULT_OLLAMA_PORT = 11434;
const MAX_FALLBACK_PORTS = 5; // tries 11435 .. 11434+MAX_FALLBACK_PORTS

interface ManagedOllama {
  child: ChildProcess | null;
  port: number; // the port we launched on
  processId: number | null;
}

let managed: ManagedOllama = { child: null, port: DEFAULT_OLLAMA_PORT, processId: null };
let getWindow: () => Electron.BrowserWindow | null = () => null;

export function initOllamaLauncher(wm: () => Electron.BrowserWindow | null): void {
  getWindow = wm;
}

// --- Helper: build a URL with a specific port from a base endpoint ---
function endpointForPort(port: number): string {
  return `http://127.0.0.1:${port}`;
}

export async function httpGetVersion(url: string, timeoutMs = 1500): Promise<string | null> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    const data: any = await res.json();
    return typeof data?.version === 'string' ? data.version : null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

// Does something answer on this port as if it were Ollama?
export async function isOllamaAt(url: string): Promise<boolean> {
  // url is a base endpoint (http://host:port); probe the version path.
  const versionUrl = url.replace(/\/+$/, '') + '/api/version';
  const v = await httpGetVersion(versionUrl);
  return v !== null;
}

export async function portInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const done = (used: boolean) => {
      socket.destroy();
      resolve(used);
    };
    socket.setTimeout(1200);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
    socket.connect(port, '127.0.0.1');
  });
}

// Find a usable port, starting from `from`. Returns the chosen port and whether
// Ollama is already listening there.
export async function pickPort(from: number): Promise<{ port: number; existingOllama: boolean }> {
  for (let p = from; p < from + MAX_FALLBACK_PORTS + 1; p++) {
    if (!(await portInUse(p))) {
      return { port: p, existingOllama: false };
    }
    // Port occupied — if it's Ollama we can just use it.
    if (await isOllamaAt(endpointForPort(p))) {
      return { port: p, existingOllama: true };
    }
    // Occupied by something else — try the next port.
  }
  return { port: from, existingOllama: false };
}

// --- Locate the Ollama executable on Windows (multiple strategies) ---
function findOllamaExe(): string | null {
  const candidates: string[] = [];
  const localAppData = process.env.LOCALAPPDATA;
  const programFiles = process.env.ProgramFiles;
  const programFilesX86 = process.env['ProgramFiles(x86)'];
  if (localAppData) {
    candidates.push(`${localAppData}\\Programs\\Ollama\\ollama.exe`);
    candidates.push(`${localAppData}\\Ollama\\ollama.exe`);
  }
  if (programFiles) candidates.push(`${programFiles}\\Ollama\\ollama.exe`);
  if (programFilesX86) candidates.push(`${programFilesX86}\\Ollama\\ollama.exe`);
  for (const c of candidates) {
    try {
      if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
    } catch {
      /* ignore */
    }
  }
  return null;
}

async function findOllamaExeViaPath(): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const { execFile } = require('child_process') as typeof import('child_process');
      execFile('where', ['ollama.exe'], { windowsHide: true }, (err, stdout) => {
        if (err || !stdout) return resolve(null);
        const line = stdout.split('\r\n').map((s) => s.trim()).find((s) => s);
        resolve(line || null);
      });
    } catch {
      resolve(null);
    }
  });
}

export async function locateOllamaExe(): Promise<string | null> {
  const quick = findOllamaExe();
  if (quick) return quick;
  const viaPath = await findOllamaExeViaPath();
  if (viaPath && fs.existsSync(viaPath)) return viaPath;
  return null;
}

// Current status of the Ollama service from CMPLX Studio's point of view.
export interface OllamaStatus {
  running: boolean;
  endpoint: string;
  pid: number | null;
  startedByApp: boolean;
  exePath: string | null;
  version?: string | null;
}

export async function getOllamaStatus(): Promise<OllamaStatus> {
  const exePath = await locateOllamaExe();
  // Prefer the port we already manage; otherwise poll the default.
  const basePort = managed.port || DEFAULT_OLLAMA_PORT;
  if (await isOllamaAt(endpointForPort(basePort))) {
    return {
      running: true,
      endpoint: endpointForPort(basePort),
      pid: managed.processId,
      startedByApp: managed.child !== null,
      exePath,
      version: await httpGetVersion(endpointForPort(basePort) + '/api/version')
    };
  }
  // Check the default port too (a previously-running Ollama may be there).
  if (DEFAULT_OLLAMA_PORT !== basePort && (await isOllamaAt(endpointForPort(DEFAULT_OLLAMA_PORT)))) {
    return {
      running: true,
      endpoint: endpointForPort(DEFAULT_OLLAMA_PORT),
      pid: null,
      startedByApp: false,
      exePath
    };
  }
  return {
    running: false,
    endpoint: endpointForPort(DEFAULT_OLLAMA_PORT),
    pid: null,
    startedByApp: false,
    exePath
  };
}

// Wait for the service to answer on the given port.
async function waitForOllama(url: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isOllamaAt(url)) return true;
    await new Promise((r) => setTimeout(r, 350));
  }
  return false;
}

function emitStatus(status: OllamaStatus): void {
  const win = getWindow();
  if (win && !win.isDestroyed()) {
    win.webContents.send('ollama:status', status);
  }
}

export async function startOllama(): Promise<{ ok: true; status: OllamaStatus } | { ok: false; error: string }> {
  const exePath = await locateOllamaExe();
  if (!exePath) {
    return {
      ok: false,
      error:
        'Ollama does not appear to be installed. Install it from https://ollama.com/download, then restart CMPLX Studio.'
    };
  }

  // If Ollama is already running (on any common port), don't launch another.
  const statusBefore = await getOllamaStatus();
  if (statusBefore.running) {
    // Persist the discovered endpoint.
    setManagedEndpoint(statusBefore.endpoint);
    emitStatus(statusBefore);
    return { ok: true, status: statusBefore };
  }

  // Choose the port — the default, or a fallback if 11434 is taken by another app.
  const { port } = await pickPort(DEFAULT_OLLAMA_PORT);
  const endpoint = endpointForPort(port);

  if (managed.child) {
    // A child is tracked but not answering yet — report the in-progress state.
    emitStatus({ running: false, endpoint, pid: managed.processId, startedByApp: true, exePath });
  }

  try {
    const env: Record<string, string> = {
      ...(process.env as Record<string, string>),
      OLLAMA_HOST: `127.0.0.1:${port}`
    };
    const child = spawn(exePath, ['serve'], {
      windowsHide: true,
      detached: process.platform !== 'win32',
      env
    });

    managed.child = child;
    managed.port = port;
    managed.processId = child.pid ?? null;

    child.stdout?.on('data', () => { /* keep alive, drain */ });
    child.stderr?.on('data', () => {
      /* keep alive, drain; startup errors are surfaced via the connection timeout */
    });
    child.on('error', (_err: any) => {
      // The exe failed to launch at all.
      managed.child = null;
      managed.processId = null;
      emitStatus({ running: false, endpoint, pid: null, startedByApp: false, exePath });
    });
    child.unref();

    const ready = await waitForOllama(endpoint, 15000);
    if (!ready) {
      // If the default port had been occupied by something else and we landed
      // on a fallback, we still failed to bring Ollama up — report clearly.
      if (!managed.child) {
        return { ok: false, error: 'Failed to start Ollama (the process exited immediately).' };
      }
      return {
        ok: false,
        error: `Ollama started but did not become reachable at ${endpoint} within 15 seconds. Check its logs or the OLLAMA_HOST setting.`
      };
    }

    setManagedEndpoint(endpoint);
    const status: OllamaStatus = {
      running: true,
      endpoint,
      pid: managed.processId,
      startedByApp: true,
      exePath
    };
    emitStatus(status);
    return { ok: true, status };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Failed to start Ollama.' };
  }
}

// Stop only an instance that CMPLX Studio started. Never touches a pre-existing one.
export function stopOllama(): { ok: boolean; error?: string } {
  if (!managed.child || !managed.processId) {
    return { ok: false, error: 'CMPLX Studio did not start this Ollama instance, so it will not stop it.' };
  }
  try {
    managed.child.kill();
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Failed to stop Ollama.' };
  }
  managed.child = null;
  managed.processId = null;
  return { ok: true };
}

// Persist the endpoint CMPLX Studio should connect to. Stored so the app keeps
// using the actual port Ollama started on (including fallback ports).
function setManagedEndpoint(endpoint: string): void {
  try {
    // Update settings in-place via the settings service (guarded require to
    // avoid an import cycle).
    const settings = require('./settingsService') as typeof import('./settingsService');
    void settings.updateSettings({ ollamaEndpoint: endpoint });
  } catch {
    /* non-fatal */
  }
}

export function destroyManagedOllama(): void {
  if (managed.child && managed.processId) {
    try {
      managed.child.kill();
    } catch {
      /* ignore */
    }
  }
  managed.child = null;
  managed.processId = null;
}

export function registerOllamaLauncherHandlers(): void {
  ipcMain.handle('ollama:start', async (): Promise<any> => startOllama());
  ipcMain.handle('ollama:stop', (): any => stopOllama());
  ipcMain.handle('ollama:status', async (): Promise<any> => {
    try {
      const s = await getOllamaStatus();
      return { ok: true, value: s };
    } catch (e: any) {
      return { ok: false, error: e?.message };
    }
  });
  ipcMain.handle('ollama:detect', async (): Promise<any> => {
    const exePath = await locateOllamaExe();
    return { ok: true, value: exePath };
  });
}