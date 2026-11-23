import fs from 'fs/promises';
import path from 'path';
import { app, ipcMain, IpcMainInvokeEvent } from 'electron';
import type { ChatMessage } from '../shared/types';

export interface SessionMeta {
  id: string;
  title: string;
  updatedAt: number;
}

export interface Session extends SessionMeta {
  messages: ChatMessage[];
}

function sessionsDir(): string {
  return path.join(app.getPath('userData'), 'sessions');
}

function sessionPath(id: string): string {
  return path.join(sessionsDir(), `${id}.json`);
}

function sanitizeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9-_]/g, '');
}

export async function listSessions(): Promise<SessionMeta[]> {
  try {
    const names = await fs.readdir(sessionsDir());
    const metas: SessionMeta[] = [];
    for (const name of names) {
      if (!name.endsWith('.json')) continue;
      try {
        const raw = await fs.readFile(path.join(sessionsDir(), name), 'utf-8');
        const s = JSON.parse(raw);
        metas.push({ id: s.id, title: s.title, updatedAt: s.updatedAt });
      } catch {
        /* skip corrupt session file */
      }
    }
    metas.sort((a, b) => b.updatedAt - a.updatedAt);
    return metas;
  } catch {
    return [];
  }
}

export async function loadSession(id: string): Promise<Session | null> {
  try {
    const raw = await fs.readFile(sessionPath(sanitizeId(id)), 'utf-8');
    const s = JSON.parse(raw);
    return s;
  } catch {
    return null;
  }
}

export async function saveSession(id: string, messages: ChatMessage[]): Promise<Session> {
  const safeId = sanitizeId(id);
  const firstUser = messages.find((m) => m.role === 'user');
  const title =
    (firstUser?.content || 'New conversation').slice(0, 60);
  const session: Session = {
    id: safeId,
    title,
    updatedAt: Date.now(),
    messages
  };
  const dir = sessionsDir();
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(sessionPath(safeId), JSON.stringify(session, null, 2), 'utf-8');
  return session;
}

export async function deleteSession(id: string): Promise<void> {
  try {
    await fs.unlink(sessionPath(sanitizeId(id)));
  } catch {
    /* already gone */
  }
}

export function newSessionId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function registerSessionsHandlers(): void {
  ipcMain.handle('sessions:list', () => listSessions().then((v) => ({ ok: true, value: v })).catch((e) => ({ ok: false, error: e.message })));
  ipcMain.handle('sessions:load', (_e: IpcMainInvokeEvent, { id }: { id: string }) => loadSession(id).then((v) => ({ ok: true, value: v })).catch((e) => ({ ok: false, error: e.message })));
  ipcMain.handle('sessions:save', (_e: IpcMainInvokeEvent, { id, messages }: { id?: string; messages: ChatMessage[] }) =>
    saveSession(id || newSessionId(), messages).then((v) => ({ ok: true, value: v.id })).catch((e) => ({ ok: false, error: e.message }))
  );
  ipcMain.handle('sessions:delete', (_e: IpcMainInvokeEvent, { id }: { id: string }) => deleteSession(id).then(() => ({ ok: true, value: null })).catch((e) => ({ ok: false, error: e.message })));
}