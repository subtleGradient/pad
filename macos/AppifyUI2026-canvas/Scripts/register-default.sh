#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="$ROOT/dist/Canvas.app"

if [[ "${CANVAS_REGISTER_SKIP_BUILD:-0}" != "1" ]]; then
  "$ROOT/Scripts/build-app.sh" >/dev/null
fi

if [[ ! -x "$APP/Contents/MacOS/Canvas" ]]; then
  echo "Missing executable app bundle at $APP" >&2
  echo "Run Scripts/build-app.sh first, or unset CANVAS_REGISTER_SKIP_BUILD." >&2
  exit 66
fi

swift "$ROOT/Scripts/register-default.swift" "$APP"
