// Shared type definitions used by the main and renderer processes.

export interface FileItem {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileItem[];
  size?: number;
  modified?: number; // ms epoch
}

export interface Tab {
  id: string;
  title: string;
  type: 'file' | 'assistant';
  filePath?: string;
  isDirty?: boolean;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  // When the assistant emits a proposed file change, it is attached here.
  pendingChange?: FileChangeSet | null;
  error?: string;
}

export interface OllamaModel {
  name: string;
  modified_at?: string;
  size?: number;
  digest?: string;
  details?: { parameter_size?: string; quantization_level?: string; family?: string };
}

export interface OllamaStatus {
  running: boolean;
  endpoint: string;
  pid: number | null;
  startedByApp: boolean;
  exePath: string | null;
  version?: string | null;
}

export interface AppSettings {
  ollamaEndpoint: string;
  ollamaModel: string;
  editorTheme: string;
  fontSize: number;
  tabSize: number;
  terminalShell: string;
  terminalFontSize: number;
  sendCrashReports: boolean;
}

// A proposed edit to a single file.
export interface FileEdit {
  path: string;
  content: string;
  summary: string;
}

// A coordinated set of proposed edits across multiple files.
export interface FileChangeSet {
  id: string;
  edits: FileEdit[];
  message: string;
}

export interface TerminalSessionInfo {
  id: string;
  pid: number;
  cwd: string;
}