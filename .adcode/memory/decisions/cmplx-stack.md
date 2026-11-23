---
name: cmplx-stack
description: "CMPLX Studio stack: Electron + React + TypeScript, Monaco, Ollama /api/chat"
type: decision
created: 2026-11-22
agents: [adcode-chat]
---

CMPLX Studio is Electron (28) + React 18 + TypeScript. Preserve this stack. Use secure IPC (contextIsolation on, preload bridge, no nodeIntegration in renderer). Ollama via official /api/tags and /api/chat streaming. Monaco via @monaco-editor/react. Terminal via node-pty in main process, IPC bridged.
