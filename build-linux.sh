#!/bin/bash
# CMPLX Studio - Linux packaging script.
# Builds the installer formats for mainstream Linux distributions:
#   - .deb      -> Debian / Ubuntu / Mint / Pop!_OS / elementary / etc.
#   - .rpm      -> Fedora / RHEL / CentOS Stream / OpenSUSE / etc.
#   - .AppImage -> portable, works on virtually every x86-64 Linux distro
#
# Run on a Linux machine (NOT Windows - the installer formats need Linux-native
# tools they cannot run on Windows). Outputs land in ./release/.
#
#   ./build-linux.sh          # all three targets
#   ./build-linux.sh deb      # just the .deb
#   ./build-linux.sh rpm      # just the .rpm
#   ./build-linux.sh AppImage # just the .AppImage
#
# Requirements:
#   Node.js + npm, and (for the formats you build):
#     deb      -> fpm  (ships a bundled tool normally)
#     rpm      -> rpmbuild (the 'rpm-build' package on Fedora, 'rpm' on Debian)
#     AppImage -> bundled automatically via electron-builder + FUSE tooling

set -e

TARGET="${1:-all}"

echo ""
echo "=== CMPLX Studio - Linux packaging ($TARGET) ==="
echo ""

# Install project dependencies if missing.
if [ ! -d node_modules ]; then
  echo "Installing dependencies (first run)..."
  npm install
  # Rebuild native modules (node-pty) for the current Node/Electron ABI.
  echo "Rebuilding native modules..."
  npm run rebuild || true
fi

echo "Type-checking..."
npm run typecheck

echo "Running unit tests..."
npm run test

echo "Building the application bundle..."
npm run build

# Rebuild the native C++ addon for the Linux target ABI if node-pty needs it.
echo "Rebuilding node-pty for Linux..."
npm run rebuild || true

case "$TARGET" in
  all)
    electron-builder --linux AppImage deb rpm
    ;;
  deb)
    electron-builder --linux deb
    ;;
  rpm)
    electron-builder --linux rpm
    ;;
  AppImage)
    electron-builder --linux AppImage
    ;;
  *)
    echo "Unknown target: $TARGET (use all | deb | rpm | AppImage)"
    exit 1
    ;;
esac

echo ""
echo "=== Build complete ==="
echo "Artifacts are in ./release/:"
ls -lh release/*.AppImage release/*.deb release/*.rpm 2>/dev/null || true
echo ""
echo "Install on Debian/Ubuntu:            sudo apt install ./release/*.deb"
echo "Install on Fedora/RHEL/OpenSUSE:     sudo dnf install ./release/*.rpm"
echo "Run the portable AppImage:           ./release/*.AppImage --appimage-extract-and-run"