---
id: task-macos-refactor-webview-keyboard-verification
level: low
status: in-progress
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
