---
id: task-macos-refactor-new-canvas-and-close-verification
level: low
status: pending
blocked_by:
  - task-macos-window-and-new-canvas-behavior
  - task-macos-green-new-canvas-and-close-implementation
expires_at: 2026-05-25T13:25:24-04:00
ok_refs:
  - .ok/macos.ok.canvas#application-menus
gap_refs:
  - gap-macos-new-canvas-flow-001
  - gap-macos-command-w-close-001
---

# REFACTOR: macOS new canvas and close verification

Assigned RGRTDD role: `@gan-refactor`.

Refactor only after green behavior. Verify `swift test` and existing smoke scripts remain aligned with native macOS expectations.
