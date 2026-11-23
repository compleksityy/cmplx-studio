# CMPLX Studio

**CMPLX Studio** is a desktop AI-powered code editor and development environment that runs locally on your machine. It pairs a full file-explorer code editor with a built-in AI assistant powered by **Ollama**, so your code and conversations never leave your computer.

It is distributed as a **standalone desktop application** — Windows installer and Linux packages — not run via `npm`. Download the latest release, install it, and you are up and running.

---

## Download & install

### Windows
1. Download **`CMPLX Studio Setup 1.0.0.exe`** from the [Releases](../../releases) page.
2. Run the installer and follow the prompts.
3. Launch **CMPLX Studio** from the Start menu or desktop shortcut.

### Linux
Pick the package for your distribution from the [Releases](../../releases) page:

| Package | Format | Distro family |
|---|---|---|
| `cmplx-studio_1.0.0_amd64.deb` | deb | Debian, Ubuntu, Linux Mint, Pop!_OS, elementary OS |
| `cmplx-studio-1.0.0.x86_64.rpm` | rpm | Fedora, RHEL, CentOS Stream, OpenSUSE |
| `CMPLX Studio-1.0.0.AppImage` | AppImage | Any x86-64 Linux (portable — no install) |

**deb:**
```bash
sudo apt install ./cmplx-studio_1.0.0_amd64.deb
```

**rpm:**
```bash
sudo dnf install ./cmplx-studio-1.0.0.x86_64.rpm          # Fedora
sudo zypper install ./cmplx-studio-1.0.0.x86_64.rpm       # OpenSUSE
```

**AppImage** (universal — works on any distro):
```bash
chmod +x "CMPLX Studio-1.0.0.AppImage"
./"CMPLX Studio-1.0.0.AppImage"
```

---

## First-run setup: Ollama

CMPLX Studio powers its AI assistant with **Ollama** running locally.

1. **Install Ollama** first if you do not have it: <https://ollama.com/download>
2. Inside CMPLX Studio, open the **AI assistant** panel and click **Start Ollama**. If Ollama is not running yet, the app starts it for you. If it is already running, it simply connects and refreshes the model list.
3. Pick a model from the dropdown (for example `qwen3:8b`). Download it if prompted (e.g. `ollama pull qwen3:8b`).

> **Port handling:** Ollama runs on port `11434`. If that port is already occupied, CMPLX Studio detects it, reuses an existing Ollama instance if one is on the port, and otherwise falls back to an alternative port (e.g. `11435`) automatically — it will notify you and connect to the port actually in use.

---

## Features

- **Code editor** — file explorer, open/write/rename/delete files and folders, tabbed editing, language-aware syntax highlighting (Monaco).
- **Built-in terminal** — PTY-based interactive shell per the platform (PowerShell on Windows, your shell on Linux).
- **AI assistant** — chat with local models through Ollama, with streaming responses and project-context injection.
- **Privacy-first & local** — everything runs on your machine; no cloud calls, no telemetry to third parties.
- **Workspace-scoped security** — file operations are confined to the opened workspace; path traversal outside the workspace is blocked.
- **Settings & sessions** — your preferences and AI conversation history persist across sessions.

A **start Ollama** state indicator and model selector live in the AI assistant panel, showing whether Ollama is online and which endpoint is in use.

---

## Minimum requirements

- **Windows 10/11** (64-bit) or a mainstream **Linux** distro (x86-64).
- ~500 MB for the application, plus whatever model size you choose for Ollama.
- No internet account required; Ollama runs locally.

---

## Building from source (contributors)

For developers who want to build directly from source:

```bash
npm install
npm run typecheck
npm run lint
npm test                 # unit tests
npm run test:e2e         # end-to-end (filesystem, PTY, settings)
npm run test:ollama      # model + chat over a mock Ollama server
```

**Package an installer:**
```bash
npm run build            # typecheck + build the renderer and backend
npm run package          # > release/  (Windows .exe via electron-builder)
```

> **Note:** the packaged Windows installer, Linux `.deb`/`.rpm`/`.AppImage`, and the GitHub Action release pipeline are all produced with **electron-builder**. Build the Linux packages on a Linux host (running `build-linux.sh`), or use the repository's GitHub Actions workflow.

---

## License

**MIT** — see `LICENSE` for details.