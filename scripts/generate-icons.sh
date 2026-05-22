#!/usr/bin/env bash
# Regenerate every app icon (web favicon set + PWA icons + Tauri desktop/mobile
# icons) from one master SVG. Two themes live in src-tauri/:
#   icon-source.svg        (dark background — the original)
#   icon-source-light.svg  (light/cream background)
# Both share the same emblem (keyboard plate + orange keys + embossed keycaps);
# only the background/border differ.
#
# THE SWITCH: change VARIANT below and re-run to flip every icon in one go.
# Hardcoded to "light" for now; a future in-app/build setting can drive it.
#
# Requires: rsvg-convert, ImageMagick (magick), and the Tauri CLI (pnpm tauri).
set -euo pipefail

VARIANT="light"   # light | dark

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
case "$VARIANT" in
  light) SRC="$ROOT/src-tauri/icon-source-light.svg" ;;
  dark)  SRC="$ROOT/src-tauri/icon-source.svg" ;;
  *) echo "VARIANT must be light or dark" >&2; exit 1 ;;
esac
PUB="$ROOT/public"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

[ -f "$SRC" ] || { echo "source not found: $SRC" >&2; exit 1; }
render() { rsvg-convert -w "$1" -h "$1" "$SRC" -o "$2"; }

echo "Theme: $VARIANT  ($SRC)"

# Web vector favicon — ship the chosen SVG as the active one.
cp "$SRC" "$PUB/favicon.svg"

# Web raster icons (referenced by index.html + site.webmanifest).
render 180 "$PUB/apple-touch-icon.png"
render 192 "$PUB/icon-192.png"
render 512 "$PUB/icon-512.png"

# Multi-size favicon.ico (16/32/48).
render 16 "$TMP/16.png"
render 32 "$TMP/32.png"
render 48 "$TMP/48.png"
magick "$TMP/16.png" "$TMP/32.png" "$TMP/48.png" "$PUB/favicon.ico"

# Desktop (dock/taskbar) + mobile icons — Tauri regenerates src-tauri/icons/*.
render 1024 "$TMP/icon-1024.png"
( cd "$ROOT" && pnpm tauri icon "$TMP/icon-1024.png" >/dev/null )

echo "Done. Regenerated public/ favicons + src-tauri/icons from the $VARIANT theme."
