import type { AppSettings, ChatMessage, OllamaStatus } from './types';
import type { Result } from './ipc';

// The object that the preload script exposes as `window.cmplx`.
// Kept here so both processes can agree on its shape without importing
// Electron in the renderer.
export interface CmplxApi {
  openDirectory: () => Promise<Result<any>>;
  readDirectory: (payload: { path: string }) => Promise<Result<any>>;
  readFile: (payload: { path: string }) => Promise<Result<string>>;
  writeFile: (payload: { path: string; content: string }) => Promise<Result<null>>;
  createFile: (payload: { path: string; content?: string }) => Promise<Result<null>>;
  createDirectory: (payload: { path: string }) => Promise<Result<null>>;
  rename: (payload: { oldPath: string; newName: string }) => Promise<Result<null>>;
  deletePath: (payload: { path: string }) => Promise<Result<null>>;
  getWorkspace: () => Promise<Result<string | null>>;

  ollamaCheck: (endpoint: string) => Promise<Result<boolean>>;
  ollamaListModels: (endpoint: string) => Promise<Result<any[]>>;
  ollamaChat: (payload: {
    endpoint: string;
    model: string;
    messages: ChatMessage[];
    projectContext?: string;
  }) => Promise<Result<null>>;
  ollamaCancel: () => Promise<Result<null>>;
  onOllamaStream: (cb: (event: { delta?: string; done?: boolean; cancelled?: boolean; error?: string }) => void) => () => void;

  // Ollama service launcher/manager
  ollamaStart: () => Promise<Result<OllamaStatus>>;
  ollamaStop: () => Promise<Result<null>>;
  ollamaStatus: () => Promise<Result<OllamaStatus>>;
  ollamaDetect: () => Promise<Result<string | null>>;
  onOllamaStatus: (cb: (status: OllamaStatus) => void) => () => void;

  settingsGet: () => Promise<Result<AppSettings>>;
  settingsSet: (settings: Partial<AppSettings>) => Promise<Result<AppSettings>>;

  sessionsList: () => Promise<Result<any[]>>;
  sessionsLoad: (id: string) => Promise<Result<any | null>>;
  sessionsSave: (id: string | undefined, messages: ChatMessage[]) => Promise<Result<string>>;
  sessionsDelete: (id: string) => Promise<Result<null>>;

  terminalCreate: (payload?: { cwd?: string; shell?: string }) => Promise<Result<{ id: string; pid: number; cwd: string }>>;
  terminalWrite: (id: string, data: string) => Promise<Result<null>>;
  terminalResize: (id: string, cols: number, rows: number) => Promise<Result<null>>;
  terminalKill: (id: string) => Promise<Result<null>>;
  terminalList: () => Promise<Result<any[]>>;
  onTerminalData: (cb: (payload: { id: string; data: string }) => void) => () => void;
  onTerminalExit: (cb: (payload: { id: string; exitCode: number }) => void) => () => void;
}