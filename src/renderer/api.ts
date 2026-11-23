import type { CmplxApi } from '../shared/cmplxApi';

declare global {
  interface Window {
    cmplx?: CmplxApi;
  }
}

export function hasBridge(): boolean {
  return typeof window !== 'undefined' && Boolean(window.cmplx);
}

export function requireBridge(): CmplxApi {
  if (!hasBridge()) {
    throw new Error('CMPLX Studio IPC bridge is not available. The app must run inside Electron.');
  }
  return window.cmplx as CmplxApi;
}

// A safe, no-op fallback used only when the Electron bridge is absent (for
// example when the renderer is viewed in a plain web browser). It lets the
// interface render without crashing while every operation resolves as a
// graceful failure. Inside Electron the real bridge is always used instead.
const noop = async (): Promise<{ ok: false; error: string }> => ({ ok: false, error: 'IPC bridge not available in this environment.' });
const unsubscribe = (): void => { /* nothing to unsubscribe */ };

const stubApi: CmplxApi = {
  // Filesystem
  openDirectory: noop,
  readDirectory: noop,
  readFile: noop,
  writeFile: noop,
  createFile: noop,
  createDirectory: noop,
  rename: noop,
  deletePath: noop,
  getWorkspace: noop,

  // Ollama
  ollamaCheck: noop,
  ollamaListModels: noop,
  ollamaChat: noop,
  ollamaCancel: noop,
  onOllamaStream: () => unsubscribe,

  // Ollama launcher
  ollamaStart: noop,
  ollamaStop: noop,
  ollamaStatus: noop,
  ollamaDetect: noop,
  onOllamaStatus: () => unsubscribe,

  // Settings
  settingsGet: noop,
  settingsSet: noop,

  // Sessions
  sessionsList: noop,
  sessionsLoad: noop,
  sessionsSave: noop,
  sessionsDelete: noop,

  // Terminal
  terminalCreate: noop,
  terminalWrite: noop,
  terminalResize: noop,
  terminalKill: noop,
  terminalList: noop,
  onTerminalData: () => unsubscribe,
  onTerminalExit: () => unsubscribe
};

export default (window.cmplx ?? stubApi) as CmplxApi;