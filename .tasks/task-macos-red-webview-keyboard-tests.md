---
id: task-macos-red-webview-keyboard-tests
level: low
status: done
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

## RED evidence

- 2026-05-18: Added `Tests/CanvasCoreTests/WebViewKeyboardTests.swift` as a source-inspection Swift test for the missing WebView keyboard quieting seam.
- Perception GAN prior: current production likely instantiates a plain `WKWebView` in `DocumentWindowController.loadWebView(url:)`, so held Spacebar/tldraw-handled keys lack an explicit macOS invalid-input-sound quieting path.
- Falsification path: assert that `DocumentWindowController.swift` declares a `CanvasKeyboardQuietingWebView` seam, exposes an overridable keyboard handling method such as `performKeyEquivalent` or `keyDown`, and does not instantiate `let webView = WKWebView(` directly.
- Verification command from `macos/AppifyUI2026-canvas`: `swift test --filter WebViewKeyboardTests`.
- Observed RED result: build succeeded, then `WebViewKeyboardTests.testDocumentWindowUsesKeyboardQuietingWebViewSeamForTldrawHandledKeys` failed at assertion level with 3 expected failures: missing `CanvasKeyboardQuietingWebView`, missing keyboard override marker, and direct plain `WKWebView` instantiation.
