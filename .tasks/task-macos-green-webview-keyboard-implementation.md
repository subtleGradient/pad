---
id: task-macos-green-webview-keyboard-implementation
level: low
status: done
blocked_by: []
expires_at: 2026-05-25T13:25:24-04:00
ok_refs:
  - .ok/macos.ok.canvas#keyboard-interactions-without-beeps
gap_refs:
  - gap-macos-webview-keyboard-quiet-001
---

# GREEN: WebView keyboard quiet implementation

Assigned RGRTDD role: `@gan-green`.

Make the keyboard quiet tests pass with the smallest safe WKWebView/AppKit implementation while preserving normal web keyboard input.

## Delegation

- 2026-05-18: delegated to `@gan-green`; owned paths: `macos/AppifyUI2026-canvas/Sources/Canvas/DocumentWindowController.swift` and this task file.

## GREEN evidence

- 2026-05-18: Reproduced red with `swift test --filter WebViewKeyboardTests` from `macos/AppifyUI2026-canvas`; observed 3 expected failures for missing `CanvasKeyboardQuietingWebView` seam, missing keyboard override marker, and plain `WKWebView` instantiation.
- 2026-05-18: Added narrow `CanvasKeyboardQuietingWebView` subclass seam that forwards non-Command key equivalents through `keyDown(with:)` and marks them handled to avoid AppKit invalid-input beeps, while preserving Command key equivalents for normal menu/window shortcuts.
- 2026-05-18: Replaced `loadWebView(url:)` plain `WKWebView` construction with `CanvasKeyboardQuietingWebView` construction; existing load and lifecycle code remains unchanged.
- 2026-05-18: `swift test --filter WebViewKeyboardTests` passed from `macos/AppifyUI2026-canvas` (1 test, 0 failures).
- 2026-05-18: `swift test` passed from `macos/AppifyUI2026-canvas` (15 tests, 0 failures).
