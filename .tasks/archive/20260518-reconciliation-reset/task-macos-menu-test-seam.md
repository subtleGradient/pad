---
id: task-macos-menu-test-seam
level: medium
status: done
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

# Add tests-first coverage for menu expectations

Create or expose a menu-building seam that can be asserted in Swift tests or deterministic UI smoke tests without relying on manual inspection.

## Completion evidence — 2026-05-18

`task-macos-menu-red-tests` added executable `MacOSMenuTests` coverage against menu declarations, and the Swift test target builds far enough to fail on the expected missing menu assertions. No additional seam task is needed before green implementation.
