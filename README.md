# CMPLX Studio

A focused desktop code editor and AI development environment, built with Electron, React, TypeScript, Monaco and Ollama.

CMPLX Studio gives you a professional code editor, an integrated real terminal, and a repository-aware AI assistant that can propose coordinated multi-file changes you review before they touch disk — all running locally against your own Ollama models.

## Features

- **Monaco editor** — full-featured code editing: syntax highlighting for 60+ languages, multi-tab editing, code folding, find/replace, line numbers, autocomplete, and unsaved-change indicators.
- **Real file explorer** — browse, open, create, rename and delete files and folders inside a selected project, with path-traversal protection so the tool can never touch files outside the open workspace.
- **Repository-aware AI assistant** — connects to any model exposed by a local [Ollama](https://ollama.com) server (default endpoint `http://localhost:11434`, default model `qwen3-coder:30b`). It discovers all installed models in the model selector (with a manual refresh), streams responses, reports connection status, and can explain, generate, refactor or debug your code using the project's actual file tree and open files as context. A configured `localhost` endpoint resolves reliably even where the OS maps it to an unreachable address.
- **Multi-file changes with diff review** — the assistant can propose creating or editing several files; CMPLX Studio shows a reviewable change set, and nothing is written until you approve it.
- **Integrated terminal** — real PowerShell (Windows) / shell with live stdout/stderr, working-directory management, long-running process support, resizing, and process termination. Backed by `node-pty`, not a fake UI.
- **Persistent settings & conversations** — endpoint, model, editor font size, tab size and terminal settings are saved; conversation history can be saved and reloaded between launches.

## Requirements

- **Node.js 18+** and npm
- **Electron** (installed via npm)
- **Ollama** running locally with a model pulled, e.g.:

```bash
ollama pull qwen3-coder:30b
ollama serve
```

## Installation & development

```bash
# Install dependencies
npm install

# Build the app once
npm run build

# Run the app
npm start
```

### Development (hot-reload)

```bash
npm run dev
```

This starts the Vite dev server for the renderer, a TypeScript watcher for the main/preload processes, and launches Electron connected to the dev server.

## Verification

```bash
# Type-check both the renderer and Electron bundles
npm run typecheck

# Lint
npm run lint

# Unit tests (change parsing, language detection)
npm run test

# End-to-end Electron tests (real filesystem, terminal, settings, sessions)
npm run test:e2e

# Ollama integration tests (against an in-process mock of the Ollama API)
npm run test:ollama
```

## Packaging

### Windows

```bash
npm run package
```

Builds the NSIS installer (uses `assets/icons/icon.ico`). The `node-pty` native binary is unpacked from the ASAR so the terminal works in packaged builds. Output: `release/CMPLX Studio Setup 1.0.0.exe` and the portable app in `release/win-unpacked/`.

### Linux (Debian, Fedora & other mainstream distros)

CMPLX Studio ships three Linux formats, built **on a Linux machine** (the installer formats and the `node-pty` native addon require Linux-native build tools, so they cannot be produced from Windows):

| Format | Distro family | Install |
|--------|--------------|---------|
| `.deb` | Debian, Ubuntu, Linux Mint, Pop!_OS, elementary OS | `sudo apt install ./release/*.deb` |
| `.rpm` | Fedora, RHEL, CentOS Stream, OpenSUSE | `sudo dnf install ./release/*.rpm` |
| `.AppImage` | Works on virtually any x86-64 Linux distro (portable, no install) | `chmod +x release/*.AppImage && ./release/*.AppImage --appimage-extract-and-run` |

**Build one or all three on a Linux machine:**

```bash
./build-linux.sh          # all: deb + rpm + AppImage
./build-linux.sh deb      # just the .deb
./build-linux.sh rpm      # just the .rpm (needs the rpm/rpmbuild package installed)
./build-linux.sh AppImage # just the .AppImage
```

The script type-checks, lints, runs the tests, rebuilds `node-pty` for the Electron ABI, and produces the selected installer(s) in `release/`. The `.AppImage` is extracted-and-run so it works without a FUSE dependency.

## Releasing on GitHub (recommended)

The **Build & Release** workflow (`.github/workflows/build-linux.yml`) is the automated path to downloadable installers. To create a release:

```bash
git push origin master
git tag v1.0.0
git push origin v1.0.0
```

Pushing a `v*` tag triggers a pipeline that, on `windows-latest` and `ubuntu-latest` runners:

1. Rebuilds `node-pty` for each platform's Electron ABI.
2. Runs **typecheck, lint, unit tests, E2E tests, and the Ollama (mock-server) integration tests.**
3. Builds the Windows NSIS installer (`.exe`) on Windows and the **`.deb`, `.rpm`, and `.AppImage`** Linux packages on Ubuntu.
4. Creates a **GitHub Release** named `CMPLX Studio <version>` (with auto-generated release notes) and attaches every successfully built installer as a download asset.

The release version is read from `package.json` (`1.0.0`), so tag `v1.0.0` produces `CMPLX Studio Setup 1.0.0.exe`, `cmplx-studio_1.0.0_amd64.deb`, `cmplx-studio-1.0.0-1.x86_64.rpm`, and `CMPLX Studio-1.0.0.AppImage` as release assets.

> The `test:launcher` / `test:live` scripts need a **real, running Ollama** and are therefore not executed in CI – run those locally with `npm run test:launcher`.

### Manual run (no tag)

You can also trigger the workflow manually from the **Actions** tab (Run workflow). It builds all installers and uploads them as temporary build artifacts (kept 7 days) for testing. A Release is only created when the run targets a `v*` tag.

Linux uses `assets/icons/` (multi-resolution PNG + ICO) for the app icons, `Development` as the freedesktop category, and ships the correct `cmplx-studio.desktop` entry for app launchers.

## Project layout

```
src/
├── main/            # Electron main process (window, IPC, filesystem, Ollama, terminal)
├── preload/         # contextBridge API exposed to the renderer
├── renderer/        # React UI (editor, file explorer, AI assistant, terminal, settings)
│   └── components/
└── shared/          # Types shared between processes
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for the detailed design, ipc surface and security model.

## License

MIT