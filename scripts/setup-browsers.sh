#!/usr/bin/env bash
# pnpm setup:browsers — installs headless Firefox and WebKit for `pnpm determinism:browsers`.
#
# Cloud sessions can't reach Playwright's browser CDN, so this uses what the Ubuntu archive offers:
#   - WebKit: WebKitGTK's MiniBrowser (libwebkit2gtk-4.1-0) under Xvfb, via apt.
#   - Firefox: Ubuntu 20.04's last real Firefox .deb (noble only ships the snap stub) plus a newer
#     libnss3, both pinned by SHA-256 and unpacked into $MUDDERS_BROWSERS_DIR (no dpkg install).
# Idempotent: exits fast when everything is already there. Linux + apt only; elsewhere install
# Playwright's builds (`pnpm --filter @mudders/capture exec playwright install firefox webkit`).
set -euo pipefail

DIR="${MUDDERS_BROWSERS_DIR:-/opt/mudders-browsers}"
MINIBROWSER=/usr/lib/x86_64-linux-gnu/webkit2gtk-4.1/MiniBrowser
POOL=http://archive.ubuntu.com/ubuntu/pool/main
FIREFOX_DEB=firefox_136.0+build3-0ubuntu0.20.04.1_amd64.deb
FIREFOX_SHA=b8d0e0cb0f9aad8f264427400ee12bd9791601df4135a6f257e0449f495a842f
NSS_DEB=libnss3_3.108-1ubuntu1_amd64.deb
NSS_SHA=cf93362ae7def3070d42dbe2b4ac69aa2c8c0f38e007ae3999e8f19dcefc64c5

if ! command -v apt-get >/dev/null || [ "$(uname -m)" != x86_64 ]; then
  echo "setup:browsers: needs x86_64 Linux with apt. Install Playwright's builds instead:"
  echo "  pnpm --filter @mudders/capture exec playwright install firefox webkit"
  exit 0
fi

SUDO=""
[ "$(id -u)" -eq 0 ] || SUDO=sudo

if [ ! -x "$MINIBROWSER" ] || ! command -v xvfb-run >/dev/null; then
  echo "setup:browsers: installing WebKitGTK + Xvfb via apt…"
  $SUDO apt-get update -qq
  DEBIAN_FRONTEND=noninteractive $SUDO apt-get install -y -qq --no-install-recommends \
    libwebkit2gtk-4.1-0 xvfb xauth >/dev/null
fi

fetch() { # fetch <subdir> <deb> <sha256> <dest>
  local tmp
  [ -d "$4" ] && return 0
  tmp="$(mktemp -d)"
  echo "setup:browsers: downloading $2…"
  curl -fsSL -o "$tmp/$2" "$POOL/$1/$2"
  echo "$3  $tmp/$2" | sha256sum -c --quiet
  $SUDO mkdir -p "$DIR"
  $SUDO dpkg-deb -x "$tmp/$2" "$4"
  rm -rf "$tmp"
}

if [ ! -x "$DIR/firefox/usr/lib/firefox/firefox" ]; then
  # Firefox's GTK/X11 deps come in with WebKitGTK above.
  $SUDO rm -rf "$DIR/firefox"
  fetch f/firefox "$FIREFOX_DEB" "$FIREFOX_SHA" "$DIR/firefox"
fi
fetch n/nss "$NSS_DEB" "$NSS_SHA" "$DIR/nss"

echo "setup:browsers: ready ($("$DIR/firefox/usr/lib/firefox/firefox" --version 2>/dev/null), WebKitGTK $(dpkg-query -W -f='${Version}' libwebkit2gtk-4.1-0))"
