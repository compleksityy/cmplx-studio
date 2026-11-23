---
name: rpm-build-ubuntu-latest-incompat
description: electron-builder rpm build must use ubuntu-22.04 runner, not ubuntu-latest
type: decision
created: 2026-11-23
agents: [adcode-chat]
---

CMPLX Studio's `.rpm` build (electron-builder 24's bundled fpm 1.9.3) fails on the `ubuntu-latest` GitHub runner with `rpmbuild failed (exit code 1)` and `error: File not found: .../BUILDROOT/opt/...`. Root cause (verified by reproducing in WSL Ubuntu 26 / rpm 6.0.1): fpm 1.9.3 generates a spec with a `# noop` `%install` and pre-copies files into `$topdir/BUILD/`, but rpmbuild 6.x lays down `$RPM_BUILD_ROOT` under `BUILD/<name>-<version>-<release>/`, so `%files` can't find them. It is NOT the space in "CMPLX Studio" and NOT the rpm compression codec (both were ruled out empirically). Manual rpmbuild works; only fpm 1.9.3 + rpmbuild 6 fails. Fix: pin the Linux build matrix entry to `ubuntu-22.04` (ships rpm 4.16, the layout fpm 1.9.3 expects). Windows stays on windows-latest; AppImage and deb build fine on any Ubuntu.
