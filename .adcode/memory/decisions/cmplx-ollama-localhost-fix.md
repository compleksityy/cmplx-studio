---
name: cmplx-ollama-localhost-fix
description: Why Ollama model discovery fails and how it was fixed
type: decision
created: 2026-11-22
agents: [adcode-chat]
---

Root cause of CMPLX Studio's Ollama model-discovery failure: Electron's Chromium `fetch` in the main process cannot reach a configured `http://localhost:11434` endpoint (it resolves to an unreachable IPv6 `::1`), even though the same URL works from a terminal with curl. Fix is in src/main/ollamaService.ts: `fetchWithEndpointFallback` + `endpointVariants` transparently retry `localhost`, `127.0.0.1` and `[::1]` aliases on connection failure for checkOllama, listModels and streamChat. Also surfaced previously-swallowed discovery errors (store refreshModels/doCheck/checkOllama now return error strings and toast them; Refresh button shows a loading state). Note: `electron scripts/*.js` resolves app.getPath('userData') to `%APPDATA%\Electron`, not the packaged `CMPLX Studio` folder — keep both in sync when testing.
