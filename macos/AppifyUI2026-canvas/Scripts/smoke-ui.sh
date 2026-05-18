#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="$ROOT/dist/Canvas.app"
EXPECTED_BUNDLE_IDENTIFIER="com.subtlegradient.Canvas"
DOCUMENT="$ROOT/Fixtures/Hello.canvas"
LOG_DIR="$HOME/Library/Logs/Canvas"
DIAGNOSTIC_REPORT_DIR="$HOME/Library/Logs/DiagnosticReports"
STAMP_FILE="$(mktemp "${TMPDIR:-/tmp}/canvas-smoke.XXXXXX")"

cleanup_processes() {
  pkill -f "$APP/Contents/MacOS/Canvas" >/dev/null 2>&1 || true
  pkill -f "pad.shebang.tsx $DOCUMENT" >/dev/null 2>&1 || true
}

verify_canvas_document_opened() {
  local runner_log runner_url runner_origin html_file asset_file

  runner_log="$(find "$LOG_DIR" -type f -name "Hello-*.log" -newer "$STAMP_FILE" -print | sort | tail -n 1)"
  if [[ -z "$runner_log" ]]; then
    echo "Canvas smoke did not create a fresh Hello canvas runner log." >&2
    return 1
  fi

  if ! grep -F "Canvas opening $DOCUMENT" "$runner_log" >/dev/null; then
    echo "Canvas runner log did not record opening $DOCUMENT." >&2
    return 1
  fi

  if ! grep -F "pad.shebang.tsx $DOCUMENT" "$runner_log" >/dev/null; then
    echo "Canvas runner log did not use the local PAD checkout for $DOCUMENT." >&2
    return 1
  fi

  runner_url="$(awk '/Hello[.]canvas: https?:\/\// { print $2; exit }' "$runner_log" | sed 's/[\"),]}]*$//')"
  if [[ -z "$runner_url" ]]; then
    echo "Canvas runner log did not include the PAD loopback URL." >&2
    return 1
  fi

  case "$runner_url" in
    http://localhost:*|http://127.0.0.1:*|http://\[::1\]:*|https://localhost:*|https://127.0.0.1:*|https://\[::1\]:*) ;;
    *)
      echo "Canvas runner URL was not loopback: $runner_url" >&2
      return 1
      ;;
  esac

  runner_origin="$(printf '%s\n' "$runner_url" | sed -E 's#^(https?://[^/]+).*#\1#')"
  html_file="$(mktemp "${TMPDIR:-/tmp}/canvas-smoke-html.XXXXXX")"
  asset_file="$(mktemp "${TMPDIR:-/tmp}/canvas-smoke-js.XXXXXX")"

  if ! curl -fsS "$runner_url" -o "$html_file"; then
    echo "Could not fetch PAD editor HTML from $runner_url." >&2
    rm -f "$html_file" "$asset_file"
    return 1
  fi

  if ! grep -F "<json-canvas-editor" "$html_file" >/dev/null ||
     ! grep -F 'file-name="Hello.canvas"' "$html_file" >/dev/null; then
    echo "PAD editor HTML did not include the Hello.canvas editor shell." >&2
    rm -f "$html_file" "$asset_file"
    return 1
  fi

  if ! curl -fsS "$runner_origin/canvas.browser.js" -o "$asset_file"; then
    echo "Could not fetch PAD canvas browser asset from $runner_origin." >&2
    rm -f "$html_file" "$asset_file"
    return 1
  fi

  if ! grep -F "json-canvas-editor" "$asset_file" >/dev/null; then
    echo "PAD canvas browser asset did not look like the canvas editor runtime." >&2
    rm -f "$html_file" "$asset_file"
    return 1
  fi

  if ! bun "$ROOT/Scripts/assert-pad-canvas-open.js" "$runner_url" "Hello.canvas" "Hello Canvas"; then
    rm -f "$html_file" "$asset_file"
    return 1
  fi

  echo "Verified Canvas opened Hello.canvas through PAD at $runner_url"
  rm -f "$html_file" "$asset_file"
}

cleanup_processes
trap cleanup_processes EXIT

if [[ "${CANVAS_SMOKE_SKIP_BUILD:-0}" != "1" ]]; then
  "$ROOT/Scripts/build-app.sh" >/dev/null
fi

if [[ ! -x "$APP/Contents/MacOS/Canvas" ]]; then
  echo "Missing executable app bundle at $APP" >&2
  exit 1
fi

codesign -vvv --deep --strict "$APP" >/dev/null

status=0
"$ROOT/Scripts/smoke-ui.jxa.js" "$APP" "$EXPECTED_BUNDLE_IDENTIFIER" "$DOCUMENT" || status=$?

if [[ "$status" -eq 0 ]]; then
  verify_canvas_document_opened || status=$?
fi

if [[ -d "$LOG_DIR" ]]; then
  while IFS= read -r log_path; do
    echo "== Canvas log: $log_path =="
    sed -n "1,220p" "$log_path"
  done < <(find "$LOG_DIR" -type f -name "*.log" -newer "$STAMP_FILE" -print | sort)
fi

if [[ -d "$DIAGNOSTIC_REPORT_DIR" ]]; then
  while IFS= read -r report_path; do
    status=1
    echo "== Canvas crash report: $report_path =="
    sed -n "1,180p" "$report_path"
  done < <(find "$DIAGNOSTIC_REPORT_DIR" -type f -name "Canvas-*.ips" -newer "$STAMP_FILE" -print | sort)
fi

rm -f "$STAMP_FILE"
exit "$status"
