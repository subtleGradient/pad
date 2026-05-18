---
id: task-macos-webview-keyboard-behavior
level: medium
status: in-progress
blocked_by: []
expires_at: 2026-05-25T13:25:24-04:00
ok_refs:
  - .ok/macos.ok.canvas#tldraw-webview-interaction
  - .ok/macos.ok.canvas#webview-keyboard-events-supported
  - .ok/macos.ok.canvas#hold-spacebar-no-error-sounds
  - .ok/macos.ok.canvas#keyboard-interactions-without-beeps
gap_refs:
  - gap-macos-webview-keyboard-quiet-001
---

# macOS WebView keyboard behavior

Create a testable seam and implementation for quiet tldraw-handled keyboard interactions inside the WKWebView.

RGRTDD order: red tests, green implementation, refactor verification.
