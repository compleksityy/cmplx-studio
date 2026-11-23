# CMPLX Studio — Architecture

This document describes how CMPLX Studio is structured, how the processes communicate, and the security model it relies on.

## Overview

CMPLX Studio is an Electron desktop application with three processes:

- **Main process** (`src/main/`) — owns the window, all filesystem access, the Ollama client, the real terminal (via `node-pty`), settings and conversation persistence.
- **Preload** (`src/preload/preload.ts`) — a minimal `contextBridge` shim that exposes a typed, curated API as `window.cmplx`. The renderer never gets Node.js access.
- **Renderer** (`src/renderer/`) — React UI: Monaco editor, file explorer, AI assistant, terminal and settings.

## Technology stack

| Area | Choice |
|------|--------|
| Desktop shell | Electron 28 |
| UI | React 18 + TypeScript, Vite 5 build |
| Editor | Monaco (`@monaco-editor/react`, bundled offline) |
| Terminal | `@xterm/xterm` (UI) + `node-pty` (process) over IPC |
| Packager | electron-builder |
| Tests | Vitest (unit) + Electron-driven E2E scripts (`scripts/verify-*.js`) |
| Lint / types | ESLint flat config, `tsc --noEmit` |

## Security model

The original scaffold ran the renderer with `nodeIntegration: true`, `contextIsolation: false` and `enableRemoteModule: true` — a serious vulnerability. CMPLX Studio now uses:

```ts
webPreferences: {
  preload: path.join(__dirname, '../preload/preload.js'),
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: false,
  spellcheck: false
}
```

No `fs`, `child_process`, `node-pty` or `electron` API is reachable from the renderer. Every operation goes through the preload's explicit, whitelisted functions.

### Filesystem guard

The main process tracks a single workspace root. Every filesystem read/write validates the resolved path stays inside that root:

```ts
function assertInside(absolutePath: string): void {
  // rejects "..", absolute paths, and anything escaping the workspace
}
```

Attempts to escape (e.g. `../settings.json` or `C:/Windows/win.ini`) are rejected before any I/O. Destructive operations (delete) require confirmation in the renderer first.

### Ollama at localhost

Ollama is called from the **main process** using Node's `fetch`, which has no CORS restrictions — the renderer cannot and does not need to reach `localhost:11434` directly. A Content-Security-Policy in `index.html` further constrains the renderer.

## IPC surface

The preload exposes `window.cmplx` with these groups (all return `Result<T> = { ok, value } | { ok, error }`):

- `openDirectory`, `readDirectory`, `readFile`, `writeFile`, `createFile`, `createDirectory`, `rename`, `deletePath`, `getWorkspace`
- `ollamaCheck`, `ollamaListModels`, `ollamaChat`, `ollamaCancel`, `onOllamaStream`
- `settingsGet`, `settingsSet`
- `sessionsList`, `sessionsLoad`, `sessionsSave`, `sessionsDelete`
- `terminalCreate`, `terminalWrite`, `terminalResize`, `terminalKill`, `terminalList`, `onTerminalData`, `onTerminalExit`

Events pushed **from main to renderer**:

- `ollama:stream` — `{ delta, done?, cancelled?, error? }` for streaming tokens.
- `terminal:data` — `{ id, data }` for live PTY output.
- `terminal:exit` — `{ id, exitCode }`.

The typed contract lives in `src/shared/cmplxApi.ts`.

## Main process services

- **`fsService.ts`** — workspace guard + all filesystem operations, atomic writes (write-to-temp-then-rename).
- **`ollamaService.ts`** — `GET /api/version`, `GET /api/tags`, and `POST /api/chat` with NDJSON streaming and abort support. Project context is injected as a system message. Because Electron's Chromium fetch reliably resolves a configured `http://localhost:...` endpoint to an unreachable IPv6 address (even though the same URL works with curl), the service transparently falls back to the loopback aliases `127.0.0.1` and `[::1]` on connection failure — so a user's `localhost` setting works inside the app without changing it.
- **`terminalService.ts`** — creates an `xterm-256color` PTY with the user's shell or Windows PowerShell, forwards data both ways, kills processes, and cleans up on quit.
- **`settingsService.ts`** — persisted `settings.json` under Electron's `userData` directory, merged over defaults.
- **`sessionsService.ts`** — conversation history persisted as JSON under `userData/sessions`.

## Renderer architecture

State is centralised in a React context (`src/renderer/store.tsx`) that provides hooks via `useCmplx()`. It owns the workspace, open tabs, per-file content and dirty state, the Ollama connection, the AI conversation, and change proposals.

Key flows:

- **Opening a project** → `api.openDirectory()` lets the user pick a folder; the tree is read and rendered by `FileExplorer`.
- **Editing** → open files create tabs; Monaco writes into the store; Ctrl+S saves via `writeFile`.
- **AI request** → the assistant collects the file tree + open files, sends them as a system message plus the chat history, and streams tokens back into a message bubble. A Stop button calls `cancelStream` (aborts the main-process fetch).
- **Proposed changes** → the model is instructed to end its reply with a fenced `PROPOSED_CHANGES` JSON block listing full file contents. The renderer parses it (`changeParse.ts`) into a change set, shows a review UI, and only writes to disk when the user approves. An edit whose content equals `__CMPLX_DELETE_FILE__` deletes instead of writing; nothing is ever overwritten without consent.

## Tests

- **Unit (Vitest)**: `changeParse.test.ts` (parsing AI change proposals), `utils.test.ts` (language detection, paths).
- **End-to-end (`scripts/verify-e2e.js`)** run under Electron against real disk and a real PTY: create/read/write/rename/delete, path-traversal rejection, terminal output, settings and session persistence.
- **Ollama (`scripts/verify-ollama.js`)** run under Electron against an in-process mock of the Ollama HTTP API: connection detection (online/offline), model listing, streaming deltas, cancellation, and project-context injection.

To test against a **real** Ollama instance, install and start Ollama, pull a model, then launch CMPLX Studio — the assistant connects to your configured endpoint.

## Build system

- `tsconfig.electron.json` — compiles `main/`, `preload/`, `shared/` to CommonJS in `dist/`.
- `tsconfig.json` — type-checks the renderer and shared types (Vite handles actual bundling).
- `vite.config.ts` — bundles the renderer to `dist/renderer/`, configuring Monaco's web workers for offline use.

`npm run build` runs both. `npm start` builds then launches Electron.