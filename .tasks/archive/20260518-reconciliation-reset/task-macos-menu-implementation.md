---
id: task-macos-menu-implementation
level: medium
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

# Implement native menu alignment

Update the macOS app menu construction to satisfy the menu OK source with the smallest safe change after red tests exist.

## Completion evidence — 2026-05-18

`task-macos-menu-green-implementation` made `MacOSMenuTests` and the full Swift package test suite pass.
