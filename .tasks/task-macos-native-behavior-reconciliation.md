---
id: task-macos-native-behavior-reconciliation
level: high
status: in-progress
blocked_by: []
expires_at: 2026-05-25T13:25:24-04:00
ok_refs:
  - .ok/macos.ok.canvas#macos-app-ok
  - .ok/macos.ok.canvas#application-menus
  - .ok/macos.ok.canvas#tldraw-webview-interaction
gap_refs:
  - gap-macos-new-canvas-flow-001
  - gap-macos-command-w-close-001
  - gap-macos-webview-keyboard-quiet-001
---

# macOS native behavior reconciliation

Complete the remaining native app behavior promised by `.ok/macos.ok.canvas`: new canvas creation/opening, deliberate window close behavior, and quiet tldraw WebView keyboard interactions.

Stop condition: child tasks are done, Swift tests cover the native behaviors, and existing app smoke expectations remain intact.
