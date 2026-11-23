import os from 'os';
import path from 'path';
import { ipcMain, IpcMainInvokeEvent } from 'electron';
import type { IPty } from 'node-pty';

declare function require(name: string): any;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pty: any = (() => {
  try {
    return require('node-pty');
  } catch {
    return null;
  }
})();

interface Session {
  id: string;
  pty: IPty;
  pid: number;
  cwd: string;
  name: string;
}

const sessions = new Map<string, Session>();
let getWindow: () => Electron.BrowserWindow | null = () => null;

export function initServices(toWindow: () => Electron.BrowserWindow | null): void {
  getWindow = toWindow;
}

function defaultShell(): string {
  if (process.platform === 'win32') {
    return process.env.COMSPEC || 'powershell.exe';
  }
  return process.env.SHELL || (os.platform() === 'darwin' ? '/bin/zsh' : '/bin/bash');
}

function parseCwd(cwd?: string): string {
  if (cwd && cwd.trim()) return path.resolve(cwd);
  return process.env.CWD_ROOT || os.homedir();
}

function emit(event: string, payload: Record<string, unknown>): void {
  const win = getWindow();
  if (win && !win.isDestroyed()) {
    win.webContents.send(event, payload);
  }
}

function createSession(cwd?: string, shell?: string): { id: string; info: { id: string; pid: number; cwd: string } } | { error: string } {
  if (!pty) {
    return { error: 'Terminal is unavailable in this build (node-pty failed to load).' };
  }
  const id = 'term-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const shellCmd = shell && shell.trim() ? shell : defaultShell();
  const workdir = parseCwd(cwd);
  const env = { ...process.env, TERM: 'xterm-256color' } as Record<string, string>;
  try {
    const proc = pty.spawn(shellCmd, [], {
      name: 'xterm-256color',
      cols: 120,
      rows: 30,
      cwd: workdir,
      env
    });
    const session: Session = { id, pty: proc, pid: proc.pid, cwd: workdir, name: shellCmd };
    sessions.set(id, session);

    proc.onData((data: string) => {
      emit('terminal:data', { id, data });
    });
    proc.onExit(({ exitCode }: { exitCode: number }) => {
      emit('terminal:exit', { id, exitCode });
      sessions.delete(id);
    });
    return { id, info: { id, pid: proc.pid, cwd: workdir } };
  } catch (err: any) {
    return { error: err.message || 'Failed to start terminal shell.' };
  }
}

export function registerTerminalHandlers(): void {
  ipcMain.handle('terminal:create', (_e: IpcMainInvokeEvent, payload: { cwd?: string; shell?: string } = {}) => {
    const created = createSession(payload?.cwd, payload?.shell);
    if ('error' in created) return { ok: false, error: created.error };
    return { ok: true, value: created.info };
  });

  ipcMain.handle('terminal:write', (_e: IpcMainInvokeEvent, { id, data }: { id: string; data: string }) => {
    const s = sessions.get(id);
    if (!s) return { ok: false, error: 'Terminal session not found.' };
    s.pty.write(data);
    return { ok: true, value: null };
  });

  ipcMain.handle('terminal:resize', (_e: IpcMainInvokeEvent, { id, cols, rows }: { id: string; cols: number; rows: number }) => {
    const s = sessions.get(id);
    if (!s) return { ok: false, error: 'Terminal session not found.' };
    try {
      s.pty.resize(Math.max(2, cols), Math.max(2, rows));
    } catch {
      /* ignore resize during spawn */
    }
    return { ok: true, value: null };
  });

  ipcMain.handle('terminal:kill', (_e: IpcMainInvokeEvent, { id }: { id: string }) => {
    const s = sessions.get(id);
    if (!s) return { ok: false, error: 'Terminal session not found.' };
    try {
      s.pty.kill();
    } catch {
      /* already dead */
    }
    sessions.delete(id);
    return { ok: true, value: null };
  });

  ipcMain.handle('terminal:list', () => {
    const list = [...sessions.values()].map((s) => ({ id: s.id, pid: s.pid, cwd: s.cwd }));
    return { ok: true, value: list };
  });
}

export function destroyAllTerminals(): void {
  for (const [, s] of sessions) {
    try {
      s.pty.kill();
    } catch {
      /* ignore */
    }
  }
  sessions.clear();
}