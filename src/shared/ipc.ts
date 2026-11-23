// Typed channel names and payload contracts for the IPC bridge.
import type { AppSettings, ChatMessage } from './types';

export const IpcChannels = {
  // Filesystem
  openDirectory: 'fs:openDirectory',
  readDirectory: 'fs:readDirectory',
  readFile: 'fs:readFile',
  writeFile: 'fs:writeFile',
  createFile: 'fs:createFile',
  createDirectory: 'fs:createDirectory',
  rename: 'fs:rename',
  deletePath: 'fs:deletePath',
  getWorkspace: 'fs:getWorkspace',

  // Ollama
  ollamaCheck: 'ollama:check',
  ollamaListModels: 'ollama:listModels',
  ollamaChat: 'ollama:chat',
  ollamaCancel: 'ollama:cancel',

  // Settings
  settingsGet: 'settings:get',
  settingsSet: 'settings:set',

  // Sessions / conversations
  sessionsList: 'sessions:list',
  sessionsLoad: 'sessions:load',
  sessionsSave: 'sessions:save',
  sessionsDelete: 'sessions:delete',

  // Terminal
  terminalCreate: 'terminal:create',
  terminalWrite: 'terminal:write',
  terminalResize: 'terminal:resize',
  terminalKill: 'terminal:kill',
  terminalList: 'terminal:list',
  terminalData: 'terminal:data',
  terminalExit: 'terminal:exit',

  // UI
  showConfirm: 'ui:confirm'
} as const;

export type NavToChannel = {
  [IpcChannels.openDirectory]: { filters?: unknown } | null;
  [IpcChannels.readDirectory]: { path: string };
  [IpcChannels.readFile]: { path: string };
  [IpcChannels.writeFile]: { path: string; content: string };
  [IpcChannels.createFile]: { path: string; content?: string };
  [IpcChannels.createDirectory]: { path: string };
  [IpcChannels.rename]: { oldPath: string; newName: string };
  [IpcChannels.deletePath]: { path: string };
  [IpcChannels.getWorkspace]: null;

  [IpcChannels.ollamaCheck]: { endpoint: string };
  [IpcChannels.ollamaListModels]: { endpoint: string };
  [IpcChannels.ollamaChat]: { endpoint: string; model: string; messages: ChatMessage[]; abortSignal?: unknown; projectContext?: string };
  [IpcChannels.ollamaCancel]: null;

  [IpcChannels.settingsGet]: null;
  [IpcChannels.settingsSet]: { settings: Partial<AppSettings> };

  [IpcChannels.sessionsList]: null;
  [IpcChannels.sessionsLoad]: { id: string };
  [IpcChannels.sessionsSave]: { id?: string; messages: ChatMessage[] };
  [IpcChannels.sessionsDelete]: { id: string };

  [IpcChannels.terminalCreate]: { cwd?: string; shell?: string };
  [IpcChannels.terminalWrite]: { id: string; data: string };
  [IpcChannels.terminalResize]: { id: string; cols: number; rows: number };
  [IpcChannels.terminalKill]: { id: string };
  [IpcChannels.terminalList]: null;

  [IpcChannels.showConfirm]: { title: string; message: string; detail?: string; confirmLabel?: string };
} & {
  [k: string]: unknown;
};

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };