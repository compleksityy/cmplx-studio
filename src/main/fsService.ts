import fs from 'fs/promises';
import path from 'path';
import { dialog, ipcMain, IpcMainInvokeEvent } from 'electron';

// A single active workspace root that the renderer may touch. All file
// operations are validated against this boundary to prevent path traversal
// and any access outside the user-selected project.
let workspaceRoot: string | null = null;

export function setWorkspaceRoot(root: string): void {
  workspaceRoot = path.resolve(root);
}

export function getWorkspaceRoot(): string | null {
  return workspaceRoot;
}

function assertInside(absolutePath: string): void {
  if (!workspaceRoot) {
    throw new Error('No project open. Open a folder first.');
  }
  const resolved = path.resolve(absolutePath);
  const rel = path.relative(workspaceRoot, resolved);
  const isChild = rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
  if (!isChild) {
    throw new Error(`Access denied: "${absolutePath}" is outside the active workspace.`);
  }
}

async function statSafe(p: string): Promise<{ isDirectory: boolean; size: number; mtimeMs: number } | null> {
  try {
    const s = await fs.stat(p);
    return { isDirectory: s.isDirectory(), size: s.size, mtimeMs: s.mtimeMs };
  } catch {
    return null;
  }
}

async function buildTree(absDir: string, depth: number): Promise<any[]> {
  if (depth > 12) return [];
  let entries;
  try {
    entries = await fs.readdir(absDir, { withFileTypes: true });
  } catch {
    return [];
  }
  entries.sort((a, b) => {
    if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  const out: any[] = [];
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist' || entry.name === '.cache') {
      continue;
    }
    const full = path.join(absDir, entry.name);
    const info = await statSafe(full);
    const item: any = {
      name: entry.name,
      path: path.relative(workspaceRoot!, full).split(path.sep).join('/'),
      type: entry.isDirectory() ? 'directory' : 'file',
      size: info?.size,
      modified: info?.mtimeMs
    };
    if (entry.isDirectory()) {
      item.children = await buildTree(full, depth + 1);
    }
    out.push(item);
  }
  return out;
}

export async function readDirectoryImpl({ path: p }: { path: string }): Promise<any> {
  if (!workspaceRoot) throw new Error('No project open. Open a folder first.');
  const abs = path.resolve(workspaceRoot, p || '');
  assertInside(abs);
  const tree = await buildTree(abs, 0);
  return { root: { name: path.basename(workspaceRoot), path: '', type: 'directory', children: tree }, workspace: workspaceRoot };
}

async function openDirectoryImpl(): Promise<any> {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openDirectory']
  });
  if (canceled || filePaths.length === 0) return { canceled: true };
  setWorkspaceRoot(filePaths[0]);
  const tree = await buildTree(workspaceRoot!, 0);
  return {
    canceled: false,
    workspace: workspaceRoot,
    root: { name: path.basename(workspaceRoot!), path: '', type: 'directory', children: tree }
  };
}

export async function readFileImpl({ path: p }: { path: string }): Promise<string> {
  const abs = path.resolve(workspaceRoot!, p);
  assertInside(abs);
  const content = await fs.readFile(abs, 'utf-8');
  return content;
}

export async function writeFileImpl({ path: p, content }: { path: string; content: string }): Promise<void> {
  const abs = path.resolve(workspaceRoot!, p);
  assertInside(abs);
  const dir = path.dirname(abs);
  await fs.mkdir(dir, { recursive: true });
  // Write atomically to avoid corrupting a file on a failed write.
  const tmp = abs + '.cmplx-tmp';
  await fs.writeFile(tmp, content, 'utf-8');
  await fs.rename(tmp, abs);
}

export async function createFileImpl({ path: p, content = '' }: { path: string; content?: string }): Promise<void> {
  const abs = path.resolve(workspaceRoot!, p);
  assertInside(abs);
  const existing = await statSafe(abs);
  if (existing) throw new Error('File already exists.');
  const dir = path.dirname(abs);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(abs, content, 'utf-8');
}

export async function createDirectoryImpl({ path: p }: { path: string }): Promise<void> {
  const abs = path.resolve(workspaceRoot!, p);
  assertInside(abs);
  await fs.mkdir(abs, { recursive: true });
}

export async function renameImpl({ oldPath, newName }: { oldPath: string; newName: string }): Promise<void> {
  const absOld = path.resolve(workspaceRoot!, oldPath);
  assertInside(absOld);
  if (!newName || newName.trim() === '') throw new Error('Name cannot be empty.');
  if (newName.includes('/') || newName.includes('\\') || newName === '.' || newName === '..') {
    throw new Error('Name cannot contain path separators.');
  }
  const absNew = path.join(path.dirname(absOld), newName);
  assertInside(absNew);
  await fs.rename(absOld, absNew);
}

export async function deletePathImpl({ path: p }: { path: string }): Promise<void> {
  const abs = path.resolve(workspaceRoot!, p);
  assertInside(abs);
  const s = await statSafe(abs);
  if (!s) throw new Error('Path not found.');
  if (s.isDirectory) {
    await fs.rm(abs, { recursive: true, force: true });
  } else {
    await fs.unlink(abs);
  }
}

export function registerFsHandlers(): void {
  const wrap = <P, R>(handler: (event: IpcMainInvokeEvent, payload: P) => Promise<R>) => async (e: IpcMainInvokeEvent, payload: P) => {
    try {
      const value = await handler(e, payload);
      return { ok: true, value };
    } catch (err: any) {
      return { ok: false, error: err?.message || 'Unknown error' };
    }
  };

  ipcMain.handle('fs:openDirectory', wrap(async () => openDirectoryImpl()));
  ipcMain.handle('fs:readDirectory', wrap(async (_e, payload: { path: string }) => readDirectoryImpl(payload)));
  ipcMain.handle('fs:readFile', wrap(async (_e, payload: { path: string }) => readFileImpl(payload)));
  ipcMain.handle('fs:writeFile', wrap(async (_e, payload: { path: string; content: string }) => writeFileImpl(payload)));
  ipcMain.handle('fs:createFile', wrap(async (_e, payload: { path: string; content?: string }) => createFileImpl(payload)));
  ipcMain.handle('fs:createDirectory', wrap(async (_e, payload: { path: string }) => createDirectoryImpl(payload)));
  ipcMain.handle('fs:rename', wrap(async (_e, payload: { oldPath: string; newName: string }) => renameImpl(payload)));
  ipcMain.handle('fs:deletePath', wrap(async (_e, payload: { path: string }) => deletePathImpl(payload)));
  ipcMain.handle('fs:getWorkspace', wrap(async () => workspaceRoot));
}

// Re-export for the window menu / UI to confirm destructive actions.
export const confirmInMain = async (window: any, opts: any) => {
  const { response } = await dialog.showMessageBox(window, {
    type: 'warning',
    buttons: [opts.confirmLabel || 'Delete', 'Cancel'],
    defaultId: 1,
    cancelId: 1,
    title: opts.title,
    message: opts.message,
    detail: opts.detail
  });
  return response === 0;
};