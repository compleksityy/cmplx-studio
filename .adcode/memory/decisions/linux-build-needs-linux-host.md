---
name: linux-build-needs-linux-host
description: Linux packaging must run on a Linux host, not Windows
type: decision
created: 2026-11-23
agents: [adcode-chat]
---

CMPLX Studio produces AppImage/deb/rpm for Linux and a proper Linux node-pty native build. These cannot be produced from the Windows dev machine because (1) AppImage needs `mksquashfs` (appimagetool), deb needs dpkg/fpm, rpm needs `rpmbuild` — all Linux-native tools, and (2) node-pty's `prebuilds/linux-x64/pty.node` must be compiled on Linux. The Windows `linux-unpacked`/`__appImage-x64` outputs lack the Linux pty.node and are NOT usable. Use `./build-linux.sh` on a Linux box, or the GitHub Actions workflow `.github/workflows/build-linux.yml` (ubuntu-latest) which builds all three formats and uploads them. Icons are committed at `assets/icons/` (not the gitignored `build/`) so CI finds them.
