---
id: task-macos-menu-green-implementation
level: low
status: done
blocked_by: []
expires_at: "2026-05-25T00:00:00Z"
ok_refs:
  - ".ok/macos.ok.canvas#standard-top-level-menus"
  - ".ok/macos.ok.canvas#file-menu-new-canvas"
  - ".ok/macos.ok.canvas#new-canvas-command-n"
gap_refs:
  - "gap-macos-menu-top-level-001"
  - "gap-macos-menu-new-canvas-001"
  - "gap-macos-menu-command-n-001"
---

# Green: make native menu tests pass

Implement File, Edit, View, Window, and Help top-level menus plus File > New Canvas with Command-N while keeping existing Open Canvas behavior intact.

Preferred delegate: `@gan-green`.

## GREEN evidence

- 2026-05-18: `swift test --filter MacOSMenuTests` from `macos/AppifyUI2026-canvas` passed: 3 tests, 0 failures.
- 2026-05-18: `swift test` from `macos/AppifyUI2026-canvas` passed: 12 tests, 0 failures.
