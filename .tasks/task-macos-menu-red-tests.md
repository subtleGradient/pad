---
id: task-macos-menu-red-tests
level: low
status: pending
blocked_by: []
expires_at: "2026-05-25T00:00:00Z"
ok_refs:
  - ".ok/macos.ok.canvas#standard-top-level-menus"
  - ".ok/macos.ok.canvas#file-menu-new-canvas"
  - ".ok/macos.ok.canvas#new-canvas-command-n"
  - ".ok/macos.ok.canvas#standard-shortcuts-preserved"
gap_refs:
  - "gap-macos-menu-top-level-001"
  - "gap-macos-menu-new-canvas-001"
  - "gap-macos-menu-command-n-001"
  - "gap-macos-menu-shortcuts-001"
---

# Red: prove current menu behavior misses OK expectations

Add failing executable tests that assert top-level File/Edit/View/Window/Help menus, File > New Canvas, Command-N, and preservation of native standard shortcuts.

Preferred delegate: `@gan-red`.
