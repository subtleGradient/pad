---
id: task-macos-red-new-canvas-and-close-tests
level: low
status: pending
blocked_by:
  - task-macos-window-and-new-canvas-behavior
expires_at: 2026-05-25T13:25:24-04:00
ok_refs:
  - .ok/macos.ok.canvas#tl-c2hhcGU6Q3dfX1lURW8za1ExcU95M2JTak1N
  - .ok/macos.ok.canvas#tl-c2hhcGU6T1U4S1VBbFNfRnhqTkI4QnhNdUct
gap_refs:
  - gap-macos-new-canvas-flow-001
  - gap-macos-command-w-close-001
---

# RED: macOS new canvas and close tests

Assigned RGRTDD role: `@gan-red`.

Add failing Swift tests proving Command-N has an implementation path that creates and opens a new `.canvas` file, and Command-W has a native close menu/action path for the current window.
