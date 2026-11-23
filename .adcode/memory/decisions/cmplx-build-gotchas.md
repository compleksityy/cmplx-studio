---
name: cmplx-build-gotchas
description: Build/verify environment quirks and workarounds
type: decision
created: 2026-11-22
agents: [adcode-chat]
---

CMPLX Studio build quirks on this machine:
- node-pty v1.1.0 loads under Electron 28 WITHOUT electron-rebuild: its prebuilt binary in prebuilds/win32-x64 is ABI-compatible. electron-builder also auto-rebuilds it during packaging.
- electron@28 binary download silently no-ops under Node 26 (install.js's extract-zip fails silently). Workaround: extract the cached zip from %LOCALAPPDATA%\electron\Cache with PowerShell Expand-Archive and write path.txt='electron.exe'. A large chunk (3.6 MB) is expected in the Vite renderer bundle because Monaco bundles offline; do not treat as an error.
- Scripts under scripts/verify-e2e.js and scripts/verify-ollama.js run under `electron` and exercise the compiled dist/ services.
