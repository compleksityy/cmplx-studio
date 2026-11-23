import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import type { AppSettings, ChatMessage, FileChangeSet, FileItem, Tab, OllamaModel, OllamaStatus } from '../shared/types';
import api from './api';
import { isOk, isDirectoryPath, cleanNamePath, langFromPath } from './utils';
import { parseChangeSet, isDeleteEdit } from './changeParse';

export interface EditableFile {
  path: string;
  content: string;
  isDirty: boolean;
  originalContent: string;
  language: string;
}

interface WorkspaceState {
  workspaceRoot: string | null;
  root: FileItem | null;
  rootName: string;
}

interface CmplxState {
  // workspace
  ws: WorkspaceState;
  openFolder: () => Promise<void>;
  refreshTree: () => Promise<void>;

  // tabs + editor
  tabs: Tab[];
  activeTabId: string;
  openTab: (path: string | undefined, type?: 'file' | 'assistant') => Promise<void>;
  setActiveTab: (id: string) => void;
  closeTab: (id: string) => void;
  files: Record<string, EditableFile>;
  updateFileContent: (path: string, content: string) => void;
  markSaved: (path: string) => void;
  revertFile: (path: string) => void;
  saveFile: (path: string) => Promise<boolean>;
  saveActiveTab: () => Promise<boolean>;
  reloadFile: (path: string) => Promise<void>;

  // explorer operations
  createFile: (parentDir: string, name: string) => Promise<boolean>;
  createDirectory: (parentDir: string, name: string) => Promise<boolean>;
  renamePath: (oldPath: string, newName: string) => Promise<boolean>;
  deletePath: (path: string) => Promise<boolean>;

  // ollama
  ollamaConnected: boolean | null;
  models: OllamaModel[];
  settings: AppSettings | null;
  setSettings: (patch: Partial<AppSettings>) => Promise<void>;
  checkOllama: () => Promise<boolean>;
  refreshModels: () => Promise<string | { models: OllamaModel[] }>;

  // Ollama launcher
  ollamaStatus: OllamaStatus | null;
  ollamaBusy: boolean;
  refreshOllamaStatus: () => Promise<OllamaStatus | null>;
  startOllama: () => Promise<boolean>;
  stopOllama: () => Promise<boolean>;

  // AI chat
  messages: ChatMessage[];
  isAiBusy: boolean;
  activeStreamId: string | null;
  sendMessage: (text: string) => Promise<void>;
  cancelStream: () => void;
  clearConversation: () => void;
  pendingChange: FileChangeSet | null;
  acceptChange: (change: FileChangeSet) => Promise<boolean>;
  rejectChange: () => void;

  // sessions
  loadSession: (id: string) => Promise<void>;
  startNewSession: () => void;
  deleteSession: (id: string) => Promise<void>;

  // terminal
  activeTerminalId: string | null;
  setActiveTerminalId: (id: string | null) => void;

  // notifications
  toast: (message: string, type?: 'info' | 'error' | 'success') => void;
  notices: { id: number; message: string; type: string }[];
  dismissNotice: (id: number) => void;
}

const CmplxContext = createContext<CmplxState | null>(null);

export function useCmplx(): CmplxState {
  const ctx = useContext(CmplxContext);
  if (!ctx) throw new Error('useCmplx must be used within CmplxProvider');
  return ctx;
}

let noticeId = 0;

export function CmplxProvider({ children }: { children: React.ReactNode }) {
  // --- workspace ---
  const [ws, setWs] = useState<WorkspaceState>({ workspaceRoot: null, root: null, rootName: '' });
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string>('');
  const [files, setFiles] = useState<Record<string, EditableFile>>({});
  const [models, setModels] = useState<OllamaModel[]>([]);
  const [ollamaConnected, setOllamaConnected] = useState<boolean | null>(null);
  const [ollamaStatus, setOllamaStatus] = useState<OllamaStatus | null>(null);
  const [ollamaBusy, setOllamaBusy] = useState(false);
  const [settings, setSettingsState] = useState<AppSettings | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isAiBusy, setIsAiBusy] = useState(false);
  const [activeStreamId, setActiveStreamId] = useState<string | null>(null);
  const [pendingChange, setPendingChange] = useState<FileChangeSet | null>(null);
  const [activeTerminalId, setActiveTerminalId] = useState<string | null>(null);
  const [notices, setNotices] = useState<{ id: number; message: string; type: string }[]>([]);

  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const toast = useCallback((message: string, type: 'info' | 'error' | 'success' = 'info') => {
    const id = ++noticeId;
    setNotices((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setNotices((prev) => prev.filter((n) => n.id !== id)), type === 'error' ? 6000 : 3500);
  }, []);

  const dismissNotice = useCallback((id: number) => {
    setNotices((prev) => prev.filter((n) => n.id !== id));
  }, []);

  // --- settings load ---
  useEffect(() => {
    (async () => {
      try {
        const res = await api.settingsGet();
        if (isOk(res)) {
          setSettingsState(res.value);
        }
      } catch {
        /* bridge unavailable in tests */
      }
    })();
  }, []);

  const setSettings = useCallback(async (patch: Partial<AppSettings>) => {
    try {
      const res = await api.settingsSet(patch);
      if (isOk(res)) setSettingsState(res.value);
      else toast(res.error, 'error');
    } catch (e: any) {
      toast(e.message, 'error');
    }
  }, [toast]);

  // --- workspace ---
  const createTerminalInRoot = useCallback(async (root: string) => {
    try {
      const res = await api.terminalCreate({ cwd: root });
      if (isOk(res) && res.value) setActiveTerminalId(res.value.id);
    } catch {
      /* terminal may be unavailable; non-fatal */
    }
  }, []);

  const openFolder = useCallback(async () => {
    try {
      const res = await api.openDirectory();
      if (isOk(res) && res.value && !res.value.canceled) {
        setWs({ workspaceRoot: res.value.workspace, root: res.value.root, rootName: res.value.root?.name || '' });
        toast('Opened project', 'success');
        // start a fresh assistant welcome message with project context
        setMessages((old) => (old.length === 0 ? [welcomeMessage(res.value.root?.name || 'project')] : old));
        // create a terminal if none active
        if (!activeTerminalId) {
          createTerminalInRoot(res.value.workspace);
        }
      }
    } catch (e: any) {
      toast(e.message, 'error');
    }
  }, [activeTerminalId, toast, createTerminalInRoot]);

  const refreshTree = useCallback(async () => {
    if (!ws.workspaceRoot) return;
    try {
      const res = await api.readDirectory({ path: '' });
      if (isOk(res)) {
        setWs({ workspaceRoot: res.value.workspace, root: res.value.root, rootName: res.value.root?.name || ws.rootName || '' });
      } else {
        toast(res.error, 'error');
      }
    } catch (e: any) {
      toast(e.message, 'error');
    }
  }, [ws.workspaceRoot, ws.rootName, toast]);

  // Restore an existing workspace on startup.
  useEffect(() => {
    (async () => {
      try {
        const res = await api.getWorkspace();
        if (isOk(res) && res.value) {
          const dirRes = await api.readDirectory({ path: '' });
          if (isOk(dirRes)) {
            setWs({ workspaceRoot: res.value, root: dirRes.value.root, rootName: dirRes.value.root?.name || '' });
          }
        }
      } catch {
        /* no persisted workspace */
      }
    })();
  }, []);

  // --- file opening / tabs ---
  const openTab = useCallback(async (path: string | undefined, type: 'file' | 'assistant' = path ? 'file' : 'assistant') => {
    if (type === 'assistant') {
      const existing = tabs.find((t) => t.type === 'assistant');
      if (existing) {
        setActiveTabId(existing.id);
        return;
      }
      const id = 'assistant';
      setTabs((prev) => [...prev, { id, title: 'AI Assistant', type: 'assistant' }]);
      setActiveTabId(id);
      return;
    }
    if (!path) return;
    // Already open?
    const existing = tabs.find((t) => t.filePath === path);
    if (existing) {
      setActiveTabId(existing.id);
      return;
    }
    try {
      const res = await api.readFile({ path });
      if (!isOk(res)) {
        toast(res.error, 'error');
        return;
      }
      const content = res.value;
      const language = langFromPath(path);
      const id = 'file-' + path;
      setTabs((prev) => [...prev, { id, title: baseNameOf(path), type: 'file', filePath: path, isDirty: false }]);
      setFiles((prev) => ({
        ...prev,
        [path]: {
          path,
          content,
          originalContent: content,
          isDirty: false,
          language
        }
      }));
      setActiveTabId(id);
    } catch (e: any) {
      toast(e.message, 'error');
    }
  }, [tabs, toast]);

  const setActiveTab = useCallback((id: string) => setActiveTabId(id), []);

  const closeTab = useCallback((id: string) => {
    setTabs((prev) => {
      const remaining = prev.filter((t) => t.id !== id);
      if (remaining.length === 0) {
        setActiveTabId('');
        return remaining;
      }
      if (id === activeTabId) {
        setActiveTabId(remaining[remaining.length - 1].id);
      }
      return remaining;
    });
  }, [activeTabId]);

  const updateFileContent = useCallback((path: string, content: string) => {
    setFiles((prev) => {
      const f = prev[path];
      if (!f) return prev;
      const isDirty = content !== f.originalContent;
      return { ...prev, [path]: { ...f, content, isDirty } };
    });
    setTabs((prev) => prev.map((t) => (t.filePath === path ? { ...t, isDirty: true } : t)));
  }, []);

  const markSaved = useCallback((path: string) => {
    setFiles((prev) => {
      const f = prev[path];
      if (!f) return prev;
      return { ...prev, [path]: { ...f, originalContent: f.content, isDirty: false } };
    });
    setTabs((prev) => prev.map((t) => (t.filePath === path ? { ...t, isDirty: false } : t)));
  }, []);

  const revertFile = useCallback((path: string) => {
    setFiles((prev) => {
      const f = prev[path];
      if (!f) return prev;
      return { ...prev, [path]: { ...f, content: f.originalContent, isDirty: false } };
    });
    setTabs((prev) => prev.map((t) => (t.filePath === path ? { ...t, isDirty: false } : t)));
  }, []);

  const saveFile = useCallback(async (path: string) => {
    const f = files[path];
    if (!f) return false;
    try {
      const res = await api.writeFile({ path, content: f.content });
      if (isOk(res)) {
        markSaved(path);
        return true;
      } else {
        toast(res.error, 'error');
        return false;
      }
    } catch (e: any) {
      toast(e.message, 'error');
      return false;
    }
  }, [files, markSaved, toast]);

  const saveActiveTab = useCallback(async () => {
    const tab = tabs.find((t) => t.id === activeTabId);
    if (!tab?.filePath) return false;
    return saveFile(tab.filePath);
  }, [tabs, activeTabId, saveFile]);

  const reloadFile = useCallback(async (path: string) => {
    try {
      const res = await api.readFile({ path });
      if (isOk(res)) {
        setFiles((prev) => {
          const f = prev[path];
          if (!f) return prev;
          return { ...prev, [path]: { ...f, content: res.value, originalContent: res.value, isDirty: false } };
        });
        setTabs((prev) => prev.map((t) => (t.filePath === path ? { ...t, isDirty: false } : t)));
        toast('File reloaded from disk', 'success');
      }
    } catch (e: any) {
      toast(e.message, 'error');
    }
  }, [toast]);

  // --- explorer operations ---
  const createFile = useCallback(async (parentDir: string, name: string) => {
    const path = parentDir ? `${cleanNamePath(parentDir)}/${name}` : name;
    try {
      const res = await api.createFile({ path, content: '' });
      if (isOk(res)) {
        await refreshTree();
        await openTab(path);
        return true;
      } else {
        toast(res.error, 'error');
        return false;
      }
    } catch (e: any) {
      toast(e.message, 'error');
      return false;
    }
  }, [refreshTree, openTab, toast]);

  const createDirectory = useCallback(async (parentDir: string, name: string) => {
    const path = parentDir ? `${parentDir}/${name}` : name;
    try {
      const res = await api.createDirectory({ path });
      if (isOk(res)) {
        await refreshTree();
        return true;
      } else {
        toast(res.error, 'error');
        return false;
      }
    } catch (e: any) {
      toast(e.message, 'error');
      return false;
    }
  }, [refreshTree, toast]);

  const renamePath = useCallback(async (oldPath: string, newName: string) => {
    try {
      const res = await api.rename({ oldPath, newName });
      if (isOk(res)) {
        await refreshTree();
        // Update tabs/file state if the renamed path is open.
        setFiles((prev) => {
          const next: Record<string, EditableFile> = {};
          for (const [k, v] of Object.entries(prev)) {
            if (k === oldPath) {
              const newFull = newPathFromRename(oldPath, newName);
              next[newFull] = { ...v, path: newFull };
            } else if (isDirectoryPath(oldPath) && k.startsWith(oldPath)) {
              next[newName + k.slice(oldPath.length)] = { ...v };
            } else {
              next[k] = v;
            }
          }
          return next;
        });
        setTabs((prev) => prev.map((t) => {
          if (t.filePath === oldPath) {
            return { ...t, filePath: newPathFromRename(oldPath, newName), title: baseNameOf(newName) };
          }
          if (oldPath && !isDirectoryPath(oldPath) && t.filePath?.startsWith(oldPath)) {
            // file path prefix rename
            return { ...t, title: baseNameOf(newName) };
          }
          return t;
        }));
        return true;
      } else {
        toast(res.error, 'error');
        return false;
      }
    } catch (e: any) {
      toast(e.message, 'error');
      return false;
    }
  }, [refreshTree, toast]);

  const deletePath = useCallback(async (path: string) => {
    try {
      const res = await api.deletePath({ path });
      if (isOk(res)) {
        await refreshTree();
        // close any tabs pointing inside the deleted path
        setTabs((prev) => {
          const remaining = prev.filter((t) => !(t.filePath === path || (t.filePath && t.filePath.startsWith(path))));
          if (remaining.length === 0) setActiveTabId('');
          return remaining;
        });
        setFiles((prev) => {
          const next: Record<string, EditableFile> = {};
          for (const [k, v] of Object.entries(prev)) {
            if (!(k === path || k.startsWith(path))) next[k] = v;
          }
          return next;
        });
        return true;
      } else {
        toast(res.error, 'error');
        return false;
      }
    } catch (e: any) {
      toast(e.message, 'error');
      return false;
    }
  }, [refreshTree, toast]);

  // --- ollama ---
  // Returns an error string on failure so callers can surface it; returns
  // null on success. Errors are never silently swallowed.
  const doCheck = useCallback(async (): Promise<string | null> => {
    const s = settingsRef.current;
    if (!s) return 'Ollama endpoint is not configured.';
    try {
      const res = await api.ollamaCheck(s.ollamaEndpoint);
      if (isOk(res)) {
        setOllamaConnected(res.value);
        return res.value ? null : `Ollama is not reachable at ${s.ollamaEndpoint}.`;
      }
      setOllamaConnected(false);
      return res.error || `Ollama check failed at ${s.ollamaEndpoint}.`;
    } catch (e: any) {
      setOllamaConnected(false);
      return e?.message || `Ollama check failed at ${s.ollamaEndpoint}.`;
    }
  }, []);

  // Fetches models and updates state. Returns the discovered models on
  // success, or an error string on failure (callers should surface it).
  const refreshModels = useCallback(async (): Promise<string | { models: OllamaModel[] }> => {
    const s = settingsRef.current;
    if (!s) return 'Ollama endpoint is not configured.';
    try {
      const res = await api.ollamaListModels(s.ollamaEndpoint);
      if (isOk(res)) {
        setModels(res.value);
        return { models: res.value };
      }
      return res.error || 'Failed to fetch Ollama models.';
    } catch (e: any) {
      return e?.message || 'Failed to fetch Ollama models.';
    }
  }, []);

  useEffect(() => {
    if (settings) {
      doCheck();
      refreshModels();
    }
  }, [settings, doCheck, refreshModels]);

  // Returns true when Ollama is connected and models were fetched.
  const checkOllama = useCallback(async (): Promise<boolean> => {
    const checkErr = await doCheck();
    if (checkErr) {
      toast(checkErr, 'error');
      return false;
    }
    const modelResult = await refreshModels();
    if (typeof modelResult === 'string') {
      toast(modelResult, 'error');
      return false;
    }
    return true;
  }, [doCheck, refreshModels, toast]);

  // --- Ollama launcher (start / stop / status) ---
  const refreshOllamaStatus = useCallback(async (): Promise<OllamaStatus | null> => {
    try {
      const res = await api.ollamaStatus();
      if (isOk(res)) {
        setOllamaStatus(res.value);
        setOllamaConnected(res.value.running);
        return res.value;
      }
      return null;
    } catch {
      return null;
    }
  }, []);

  const handleLauncherStatus = useCallback(async (status: OllamaStatus) => {
    setOllamaStatus(status);
    setOllamaConnected(status.running);
    if (status.running && status.endpoint) {
      // Ensure the app points at the actual port Ollama is on (may be a fallback).
      const s = settingsRef.current;
      if (s && s.ollamaEndpoint !== status.endpoint) {
        try {
          const setRes = await api.settingsSet({ ollamaEndpoint: status.endpoint });
          if (isOk(setRes)) setSettingsState(setRes.value);
        } catch {
          /* non-fatal */
        }
      }
      // Refresh models now that Ollama is online.
      await refreshModels();
    }
  }, [refreshModels]);

  useEffect(() => {
    const unsubscribe = api.onOllamaStatus((status) => {
      void handleLauncherStatus(status);
    });
    return unsubscribe;
  }, [handleLauncherStatus]);

  const startOllama = useCallback(async (): Promise<boolean> => {
    if (ollamaBusy) return false;
    setOllamaBusy(true);
    try {
      const res = await api.ollamaStart();
      if (isOk(res)) {
        const st = res.value;
        setOllamaStatus(st);
        setOllamaConnected(st.running);
        if (st.running) {
          // Persist/use the actual endpoint (default or fallback port).
          const s = settingsRef.current;
          if (s && s.ollamaEndpoint !== st.endpoint) {
            try {
              const setRes = await api.settingsSet({ ollamaEndpoint: st.endpoint });
              if (isOk(setRes)) setSettingsState(setRes.value);
            } catch { /* non-fatal */ }
          }
          const msgs = await refreshModels();
          if (typeof msgs !== 'string') {
            toast(`Ollama started successfully on ${st.endpoint}`, 'success');
          } else {
            toast(`Ollama is running on ${st.endpoint}, but no models were discovered.`, 'success');
          }
        }
        return true;
      }
      toast(res.error || 'Failed to start Ollama.', 'error');
      return false;
    } catch (e: any) {
      toast(e?.message || 'Failed to start Ollama.', 'error');
      return false;
    } finally {
      setOllamaBusy(false);
    }
  }, [ollamaBusy, refreshModels, toast]);

  const stopOllama = useCallback(async (): Promise<boolean> => {
    try {
      const res = await api.ollamaStop();
      if (isOk(res)) {
        setOllamaConnected(false);
        await refreshOllamaStatus();
        toast('Ollama stopped.', 'info');
        return true;
      }
      toast(res.error || 'Could not stop Ollama.', 'error');
      return false;
    } catch (e: any) {
      toast(e?.message || 'Could not stop Ollama.', 'error');
      return false;
    }
  }, [refreshOllamaStatus, toast]);

  // --- AI chat ---
  const startNewSession = useCallback(() => {
    setMessages([]);
    setPendingChange(null);
    setActiveStreamId(null);
    setIsAiBusy(false);
  }, []);

  const loadSession = useCallback(async (id: string) => {
    try {
      const res = await api.sessionsLoad(id);
      if (isOk(res) && res.value) {
        setMessages(res.value.messages || []);
        setPendingChange(null);
        setActiveTabId('assistant');
      } else if (isOk(res)) {
        toast('Session not found', 'error');
      }
    } catch (e: any) {
      toast(e.message, 'error');
    }
  }, [toast]);

  const deleteSession = useCallback(async (id: string) => {
    try {
      await api.sessionsDelete(id);
    } catch (e: any) {
      toast(e.message, 'error');
    }
  }, [toast]);

  const buildProjectContext = useCallback(async (): Promise<string> => {
    if (!ws.workspaceRoot) return '';
    // read the tree and a handful of small open/source files
    const parts: string[] = [
      `Project root: ${ws.rootName}`,
      `\nWhen you want to create or edit files, end your reply with a fenced code block on its own lines starting exactly with the word PROPOSED_CHANGES followed by JSON of this shape:\n\n\`\`\`json\nPROPOSED_CHANGES\n{\n  "message": "one-line summary of the change",\n  "edits": [\n    { "path": "relative/path/in/project.ts", "content": "full new file contents", "summary": "what changed here" }\n  ]\n}\n\`\`\`\n\nProvide the COMPLETE new file content for each edited file (not a diff), relative to the project root, and never invent paths outside the repository. If you only answer in prose, no file changes are made. For deletion requests, use an edit with content equal to the marker __CMPLX_DELETE_FILE__.`
    ];
    try {
      const dirRes = await api.readDirectory({ path: '' });
      if (isOk(dirRes)) {
        const files250 = collectFilePaths(dirRes.value.root, '', 0);
        parts.push('\n-- File tree (first ~120 paths) --');
        parts.push(files250.slice(0, 120).join('\n'));
      }
      // Include contents of currently open files (truncated).
      const openTabs = tabs.filter((t) => t.filePath && files[t.filePath]);
      if (openTabs.length > 0) {
        parts.push('\n-- Open file contents --');
        for (const t of openTabs.slice(0, 5)) {
          const f = files[t.filePath!];
          if (f) {
            const content = f.content.length > 8000 ? f.content.slice(0, 8000) + '\n...truncated' : f.content;
            parts.push(`\n### ${t.filePath}\n\`\`\`\n${content}\n\`\`\``);
          }
        }
      }
    } catch {
      /* context is best-effort */
    }
    return parts.join('\n');
  }, [ws, tabs, files]);

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isAiBusy) return;
    const s = settingsRef.current;
    if (!s) {
      toast('Settings not loaded yet.', 'error');
      return;
    }
    if (ollamaConnected === false) {
      toast(`Ollama is not reachable at ${s.ollamaEndpoint}. Start Ollama and check your settings.`, 'error');
      return;
    }

    const userMsg: ChatMessage = { id: cryptoRandomId(), role: 'user', content: trimmed, timestamp: Date.now() };
    const assistantMsg: ChatMessage = { id: cryptoRandomId(), role: 'assistant', content: '', timestamp: Date.now() };
    const history = [...messages, userMsg];
    const modelName = s.ollamaModel;

    setMessages([...history, assistantMsg]);
    setIsAiBusy(true);
    setActiveStreamId(assistantMsg.id);
    setPendingChange(null);

    const buildContext = await buildProjectContext();

    const unsubscribe = api.onOllamaStream(({ delta, done, cancelled, error }) => {
      if (done) {
        setActiveStreamId(null);
        setIsAiBusy(false);
        if (cancelled && !assistantMsg.content) {
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantMsg.id ? { ...m, content: '_(request cancelled)_', error: undefined } : m))
          );
        }
        unsubscribe();
      } else if (error) {
        setActiveStreamId(null);
        setIsAiBusy(false);
        setMessages((prev) => prev.map((m) => (m.id === assistantMsg.id ? { ...m, error } : m)));
        toast(`Ollama error: ${error}`, 'error');
        unsubscribe();
      } else if (delta) {
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantMsg.id ? { ...m, content: m.content + delta } : m))
        );
      }
    });

    try {
      const result = await api.ollamaChat({
        endpoint: s.ollamaEndpoint,
        model: modelName,
        messages: history,
        projectContext: buildContext
      });
      if (!isOk(result)) {
        setActiveStreamId(null);
        setIsAiBusy(false);
        setMessages((prev) => prev.map((m) => (m.id === assistantMsg.id ? { ...m, error: result.error } : m)));
      }
    } catch (e: any) {
      setActiveStreamId(null);
      setIsAiBusy(false);
      setMessages((prev) => prev.map((m) => (m.id === assistantMsg.id ? { ...m, error: e.message } : m)));
    }
  }, [messages, isAiBusy, ollamaConnected, buildProjectContext, toast]);

  const cancelStream = useCallback(() => {
    api.ollamaCancel();
    setActiveStreamId(null);
    setIsAiBusy(false);
  }, []);

  const clearConversation = useCallback(() => {
    setMessages([]);
    setPendingChange(null);
  }, []);

  // Parse a pending change set from the assistant's final code block.
  useEffect(() => {
    // Look at the last assistant message for a fenced change spec.
    const last = messages[messages.length - 1];
    if (!last || last.role !== 'assistant' || isAiBusy) return;
    const change = parseChangeSet(last.content);
    setPendingChange(change);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, isAiBusy]);

  const acceptChange = useCallback(async (change: FileChangeSet) => {
    let ok = true;
    for (const edit of change.edits) {
      try {
        if (isDeleteEdit(edit)) {
          // Explicit deletion request.
          const res = await api.deletePath({ path: edit.path });
          if (!isOk(res)) {
            toast(`Failed to delete ${edit.path}: ${res.error}`, 'error');
            ok = false;
            break;
          }
          // Close the tab and drop cached content.
          setTabs((prev) => prev.filter((t) => t.filePath !== edit.path));
          setFiles((prev) => {
            const next = { ...prev };
            delete next[edit.path];
            return next;
          });
          continue;
        }
        const res = await api.writeFile({ path: edit.path, content: edit.content });
        if (!isOk(res)) {
          toast(`Failed to write ${edit.path}: ${res.error}`, 'error');
          ok = false;
          break;
        }
      } catch (e: any) {
        toast(`Failed to write ${edit.path}: ${e.message}`, 'error');
        ok = false;
        break;
      }
    }
    if (ok) {
      setPendingChange(null);
      toast(`Applied ${change.edits.length} change(s) to disk`, 'success');
      await refreshTree();
      // reload open files for affected paths
      for (const edit of change.edits) {
        if (edit.content !== '__CMPLX_DELETE_FILE__') {
          await reloadFile(edit.path);
        }
      }
      toast('Editor refreshed to show updated files', 'success');
      return true;
    }
    return false;
  }, [refreshTree, reloadFile, toast]);

  const rejectChange = useCallback(() => {
    setPendingChange(null);
    toast('Changes rejected; nothing was written to disk', 'info');
  }, [toast]);

  return (
    <CmplxContext.Provider
      value={{
        ws,
        openFolder,
        refreshTree,
        tabs,
        activeTabId,
        openTab,
        setActiveTab,
        closeTab,
        files,
        updateFileContent,
        markSaved,
        revertFile,
        saveFile,
        saveActiveTab,
        reloadFile,
        createFile,
        createDirectory,
        renamePath,
        deletePath,
        ollamaConnected,
        models,
        settings,
        setSettings,
        checkOllama,
        refreshModels,
        ollamaStatus,
        ollamaBusy,
        refreshOllamaStatus,
        startOllama,
        stopOllama,
        messages,
        isAiBusy,
        activeStreamId,
        sendMessage,
        cancelStream,
        clearConversation,
        pendingChange,
        acceptChange,
        rejectChange,
        loadSession,
        startNewSession,
        deleteSession,
        activeTerminalId,
        setActiveTerminalId,
        toast,
        notices,
        dismissNotice
      }}
    >
      {children}
    </CmplxContext.Provider>
  );
}

// --- helpers ---
function baseNameOf(p: string): string {
  const parts = p.split(/[\/\\]/);
  return parts[parts.length - 1];
}

function newPathFromRename(oldPath: string, newName: string): string {
  const parts = oldPath.split('/');
  parts[parts.length - 1] = newName;
  return parts.join('/');
}

function cryptoRandomId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID().slice(0, 8);
  }
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function collectFilePaths(node: FileItem | null, prefix: string, depth: number): string[] {
  if (!node) return [];
  if (depth > 6) return [];
  const out: string[] = [];
  if (node.name) out.push(`${prefix}${node.name}${node.type === 'directory' ? '/' : ''}`);
  for (const child of node.children || []) {
    out.push(...collectFilePaths(child, `${prefix}${node.name}/`, depth + 1));
  }
  return out;
}

function welcomeMessage(rootName: string): ChatMessage {
  return {
    id: cryptoRandomId(),
    role: 'assistant',
    content: `Project **${rootName}** is open. Anything you ask me will include its file structure so I can give accurate, repo-aware answers. Try:\n\n- "Explain how the file explorer works"\n- "Create a component \`Button.tsx\` that exports a styled button"\n- "Refactor \`main.ts\` to add error handling"\n\nI'll propose file changes as a reviewable diff before writing anything to disk.`,
    timestamp: Date.now()
  };
}

// --- Parsing helper to extract an AI-proposed change set from a message ---
// (Implementation lives in ./changeParse.ts)