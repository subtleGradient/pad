---
id: task-macos-window-and-new-canvas-behavior
level: medium
status: done
blocked_by: []
expires_at: 2026-05-25T13:25:24-04:00
ok_refs:
  - .ok/macos.ok.canvas#file-menu-new-canvas
  - .ok/macos.ok.canvas#new-canvas-command-n
  - .ok/macos.ok.canvas#tl-c2hhcGU6Q3dfX1lURW8za1ExcU95M2JTak1N
  - .ok/macos.ok.canvas#tl-c2hhcGU6T1U4S1VBbFNfRnhqTkI4QnhNdUct
gap_refs:
  - gap-macos-new-canvas-flow-001
  - gap-macos-command-w-close-001
---

# macOS new canvas and window close behavior

Implement and test the native menu behaviors that create/open a new `.canvas` file and close the current window with Command-W.

RGRTDD order: red tests, green implementation, refactor verification.

## Completion evidence

- 2026-05-18: `task-macos-red-new-canvas-and-close-tests`, `task-macos-green-new-canvas-and-close-implementation`, and `task-macos-refactor-new-canvas-and-close-verification` are done.
- Final verification: `swift test` passed from `macos/AppifyUI2026-canvas` with 15 tests and 0 failures.
