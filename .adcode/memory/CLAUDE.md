<!--
  GENERATED FILE - do not edit.

  Rewritten from .adcode/memory/**/*.md on every memory write. Any edit here is lost
  on the next one. Edit the markdown files instead; they are the source of truth.
-->

# Project memory

Shared memory for every AI working in this project. Read this first; it is the
cheapest way to find out what has already been decided and why.

## Decisions

### cmplx-build-gotchas

Build/verify environment quirks and workarounds

CMPLX Studio build quirks on this machine:
- node-pty v1.1.0 loads under Electron 28 WITHOUT electron-rebuild: its prebuilt binary in prebuilds/win32-x64 is ABI-compatible. electron-builder also auto-rebuilds it during packaging.
- electron@28 binary download silently no-ops under Node 26 (install.js's extract-zip fails silently). Workaround: extract the cached zip from %LOCALAPPDATA%\electron\Cache with PowerShell Expand-Archive and write path.txt='electron.exe'. A large chunk (3.6 MB) is expected in the Vite renderer bundle because Monaco bundles offline; do not treat as an error.
- Scripts under scripts/verify-e2e.js and scripts/verify-ollama.js run under `electron` and exercise the compiled dist/ services.

### cmplx-ollama-localhost-fix

Why Ollama model discovery fails and how it was fixed

Root cause of CMPLX Studio's Ollama model-discovery failure: Electron's Chromium `fetch` in the main process cannot reach a configured `http://localhost:11434` endpoint (it resolves to an unreachable IPv6 `::1`), even though the same URL works from a terminal with curl. Fix is in src/main/ollamaService.ts: `fetchWithEndpointFallback` + `endpointVariants` transparently retry `localhost`, `127.0.0.1` and `[::1]` aliases on connection failure for checkOllama, listModels and streamChat. Also surfaced previously-swallowed discovery errors (store refreshModels/doCheck/checkOllama now return error strings and toast them; Refresh button shows a loading state). Note: `electron scripts/*.js` resolves app.getPath('userData') to `%APPDATA%\Electron`, not the packaged `CMPLX Studio` folder — keep both in sync when testing.

### cmplx-stack

CMPLX Studio stack: Electron + React + TypeScript, Monaco, Ollama /api/chat

CMPLX Studio is Electron (28) + React 18 + TypeScript. Preserve this stack. Use secure IPC (contextIsolation on, preload bridge, no nodeIntegration in renderer). Ollama via official /api/tags and /api/chat streaming. Monaco via @monaco-editor/react. Terminal via node-pty in main process, IPC bridged.

### linux-build-needs-linux-host

Linux packaging must run on a Linux host, not Windows

CMPLX Studio produces AppImage/deb/rpm for Linux and a proper Linux node-pty native build. These cannot be produced from the Windows dev machine because (1) AppImage needs `mksquashfs` (appimagetool), deb needs dpkg/fpm, rpm needs `rpmbuild` — all Linux-native tools, and (2) node-pty's `prebuilds/linux-x64/pty.node` must be compiled on Linux. The Windows `linux-unpacked`/`__appImage-x64` outputs lack the Linux pty.node and are NOT usable. Use `./build-linux.sh` on a Linux box, or the GitHub Actions workflow `.github/workflows/build-linux.yml` (ubuntu-latest) which builds all three formats and uploads them. Icons are committed at `assets/icons/` (not the gitignored `build/`) so CI finds them.

### rpm-build-ubuntu-latest-incompat

electron-builder rpm build must use ubuntu-22.04 runner, not ubuntu-latest

CMPLX Studio's `.rpm` build (electron-builder 24's bundled fpm 1.9.3) fails on the `ubuntu-latest` GitHub runner with `rpmbuild failed (exit code 1)` and `error: File not found: .../BUILDROOT/opt/...`. Root cause (verified by reproducing in WSL Ubuntu 26 / rpm 6.0.1): fpm 1.9.3 generates a spec with a `# noop` `%install` and pre-copies files into `$topdir/BUILD/`, but rpmbuild 6.x lays down `$RPM_BUILD_ROOT` under `BUILD/<name>-<version>-<release>/`, so `%files` can't find them. It is NOT the space in "CMPLX Studio" and NOT the rpm compression codec (both were ruled out empirically). Manual rpmbuild works; only fpm 1.9.3 + rpmbuild 6 fails. Fix: pin the Linux build matrix entry to `ubuntu-22.04` (ships rpm 4.16, the layout fpm 1.9.3 expects). Windows stays on windows-latest; AppImage and deb build fine on any Ubuntu.
