---
id: task-macos-red-webview-keyboard-tests
level: low
status: in-progress
blocked_by: []
expires_at: 2026-05-25T13:25:24-04:00
ok_refs:
  - .ok/macos.ok.canvas#webview-keyboard-events-supported
  - .ok/macos.ok.canvas#hold-spacebar-no-error-sounds
gap_refs:
  - gap-macos-webview-keyboard-quiet-001
---

# RED: WebView keyboard quiet tests

Assigned RGRTDD role: `@gan-red`.

Add a failing Swift-testable seam for WebView keyboard handling that proves tldraw-handled keys such as held Spacebar are not treated as invalid macOS input.

## Delegation

- 2026-05-18: delegated to `@gan-red`; owned paths: Swift tests under `macos/AppifyUI2026-canvas/Tests/CanvasCoreTests/` and test-only seams if needed.
