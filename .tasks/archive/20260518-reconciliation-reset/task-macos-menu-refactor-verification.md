---
id: task-macos-menu-refactor-verification
level: medium
status: done
blocked_by: []
expires_at: "2026-05-25T00:00:00Z"
ok_refs:
  - ".ok/macos.ok.canvas#standard-shortcuts-preserved"
  - ".ok/macos.ok.canvas#tl-c2hhcGU6S05hbnZ3WlBDdGZCQmdNR2RfaEJK"
gap_refs:
  - "gap-macos-menu-shortcuts-001"
---

# Refactor and verify native platform expectations

Clean up the implementation and verify the menu bar remains native and smoke-testable.

## Completion evidence — 2026-05-18

`task-macos-menu-refactor-and-smoke` verified the full Swift test suite and `./Scripts/smoke-ui.sh` without requiring source refactor changes.
