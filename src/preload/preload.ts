import { contextBridge, ipcRenderer } from 'electron';
import type { AppSettings, ChatMessage, OllamaStatus } from '../shared/types';

// A minimal, explicit API surface. The renderer never gets Node access;
// only these curated IPC functions are exposed.

const api = {
  // --- Filesystem ---
  openDirectory: () => ipcRenderer.invoke('fs:openDirectory'),
  readDirectory: (payload: { path: string }) => ipcRenderer.invoke('fs:readDirectory', payload),
  readFile: (payload: { path: string }) => ipcRenderer.invoke('fs:readFile', payload),
  writeFile: (payload: { path: string; content: string }) => ipcRenderer.invoke('fs:writeFile', payload),
  createFile: (payload: { path: string; content?: string }) => ipcRenderer.invoke('fs:createFile', payload),
  createDirectory: (payload: { path: string }) => ipcRenderer.invoke('fs:createDirectory', payload),
  rename: (payload: { oldPath: string; newName: string }) => ipcRenderer.invoke('fs:rename', payload),
  deletePath: (payload: { path: string }) => ipcRenderer.invoke('fs:deletePath', payload),
  getWorkspace: () => ipcRenderer.invoke('fs:getWorkspace'),

  // --- Ollama ---
  ollamaCheck: (endpoint: string) => ipcRenderer.invoke('ollama:check', { endpoint }),
  ollamaListModels: (endpoint: string) => ipcRenderer.invoke('ollama:listModels', { endpoint }),
  ollamaChat: (payload: {
    endpoint: string;
    model: string;
    messages: ChatMessage[];
    projectContext?: string;
  }) => ipcRenderer.invoke('ollama:chat', payload),
  ollamaCancel: () => ipcRenderer.invoke('ollama:cancel'),
  onOllamaStream: (cb: (event: { delta?: string; done?: boolean; cancelled?: boolean; error?: string }) => void) => {
    const listener = (_e: unknown, data: { delta?: string; done?: boolean; cancelled?: boolean; error?: string }) => cb(data);
    ipcRenderer.on('ollama:stream', listener);
    return () => ipcRenderer.removeListener('ollama:stream', listener);
  },

  // --- Ollama service launcher/manager ---
  ollamaStart: () => ipcRenderer.invoke('ollama:start'),
  ollamaStop: () => ipcRenderer.invoke('ollama:stop'),
  ollamaStatus: () => ipcRenderer.invoke('ollama:status'),
  ollamaDetect: () => ipcRenderer.invoke('ollama:detect'),
  onOllamaStatus: (cb: (status: OllamaStatus) => void) => {
    const listener = (_e: unknown, status: OllamaStatus) => cb(status);
    ipcRenderer.on('ollama:status', listener);
    return () => ipcRenderer.removeListener('ollama:status', listener);
  },

  // --- Settings ---
  settingsGet: () => ipcRenderer.invoke('settings:get'),
  settingsSet: (settings: Partial<AppSettings>) => ipcRenderer.invoke('settings:set', { settings }),

  // --- Sessions ---
  sessionsList: () => ipcRenderer.invoke('sessions:list'),
  sessionsLoad: (id: string) => ipcRenderer.invoke('sessions:load', { id }),
  sessionsSave: (id: string | undefined, messages: ChatMessage[]) => ipcRenderer.invoke('sessions:save', { id, messages }),
  sessionsDelete: (id: string) => ipcRenderer.invoke('sessions:delete', { id }),

  // --- Terminal ---
  terminalCreate: (payload?: { cwd?: string; shell?: string }) => ipcRenderer.invoke('terminal:create', payload),
  terminalWrite: (id: string, data: string) => ipcRenderer.invoke('terminal:write', { id, data }),
  terminalResize: (id: string, cols: number, rows: number) => ipcRenderer.invoke('terminal:resize', { id, cols, rows }),
  terminalKill: (id: string) => ipcRenderer.invoke('terminal:kill', { id }),
  terminalList: () => ipcRenderer.invoke('terminal:list'),
  onTerminalData: (cb: (payload: { id: string; data: string }) => void) => {
    const listener = (_e: unknown, payload: { id: string; data: string }) => cb(payload);
    ipcRenderer.on('terminal:data', listener);
    return () => ipcRenderer.removeListener('terminal:data', listener);
  },
  onTerminalExit: (cb: (payload: { id: string; exitCode: number }) => void) => {
    const listener = (_e: unknown, payload: { id: string; exitCode: number }) => cb(payload);
    ipcRenderer.on('terminal:exit', listener);
    return () => ipcRenderer.removeListener('terminal:exit', listener);
  }
};

export type CmplxApi = typeof api;

contextBridge.exposeInMainWorld('cmplx', api);