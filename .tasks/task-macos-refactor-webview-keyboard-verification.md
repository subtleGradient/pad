---
id: task-macos-refactor-webview-keyboard-verification
level: low
status: done
blocked_by: []
expires_at: 2026-05-25T13:25:24-04:00
ok_refs:
  - .ok/macos.ok.canvas#tldraw-webview-interaction
gap_refs:
  - gap-macos-webview-keyboard-quiet-001
---

# REFACTOR: WebView keyboard verification

Assigned RGRTDD role: `@gan-refactor`.

Refactor only after green behavior. Verify `swift test` and any practical local smoke check available for held Spacebar/tldraw keyboard interaction.

## Delegation

- 2026-05-18: delegated to `@gan-refactor`; owned paths: `macos/AppifyUI2026-canvas/Sources/Canvas/DocumentWindowController.swift`, related focused tests/smoke only if needed, and this task file.

## REFACTOR evidence

- 2026-05-18: Refactored `CanvasKeyboardQuietingWebView.performKeyEquivalent(with:)` to name the routing predicate as `shouldRouteKeyEquivalentToWebContent(_:)`, preserving the existing behavior: non-Command keyDown events are forwarded to `keyDown(with:)`; Command key equivalents and non-keyDown events continue through `super`.
- Verification passed from `macos/AppifyUI2026-canvas`:
  - `swift test --filter WebViewKeyboardTests` — passed before refactor and after refactor.
  - `swift test` — passed before refactor and after refactor; full suite reported 15 tests, 0 failures.
  - `Scripts/smoke-ui.sh` — passed; verified `Hello.canvas` opened through PAD and the PAD WebSocket loaded the canvas.
- Held-Spacebar/tldraw keyboard interaction was not directly automatable with the available focused smoke script in this scope. Coverage used: source-level WebView keyboard seam test plus UI smoke for normal WebView loading/PAD canvas connection.
