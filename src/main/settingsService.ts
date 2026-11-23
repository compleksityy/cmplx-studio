import fs from 'fs/promises';
import path from 'path';
import { app, ipcMain, IpcMainInvokeEvent } from 'electron';
import type { AppSettings } from '../shared/types';

export const DEFAULT_SETTINGS: AppSettings = {
  ollamaEndpoint: 'http://localhost:11434',
  ollamaModel: 'qwen3-coder:30b',
  editorTheme: 'vs-dark',
  fontSize: 14,
  tabSize: 2,
  terminalShell: '', // '' = auto-detect platform default
  terminalFontSize: 13,
  sendCrashReports: false
};

let cache: AppSettings | null = null;

function settingsFile(): string {
  return path.join(app.getPath('userData'), 'settings.json');
}

async function load(): Promise<AppSettings> {
  if (cache) return cache;
  try {
    const raw = await fs.readFile(settingsFile(), 'utf-8');
    const parsed = JSON.parse(raw);
    cache = { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    cache = { ...DEFAULT_SETTINGS };
  }
  return cache!;
}

export async function getSettings(): Promise<AppSettings> {
  return load();
}

export async function updateSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const current = await load();
  cache = { ...current, ...patch };
  try {
    const dir = path.dirname(settingsFile());
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(settingsFile(), JSON.stringify(cache, null, 2), 'utf-8');
  } catch (err) {
    // Persisting is best-effort; report but keep in-memory value.
    throw err;
  }
  return cache!;
}

export function registerSettingsHandlers(): void {
  ipcMain.handle('settings:get', () => getSettings().then((v) => ({ ok: true, value: v })).catch((e) => ({ ok: false, error: e.message })));
  ipcMain.handle('settings:set', (_e: IpcMainInvokeEvent, { settings }: { settings: Partial<AppSettings> }) =>
    updateSettings(settings).then((v) => ({ ok: true, value: v })).catch((e) => ({ ok: false, error: e.message }))
  );
}