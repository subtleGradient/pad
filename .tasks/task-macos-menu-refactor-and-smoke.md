---
id: task-macos-menu-refactor-and-smoke
level: low
status: pending
blocked_by:
  - "task-macos-menu-refactor-verification"
expires_at: "2026-05-25T00:00:00Z"
ok_refs:
  - ".ok/macos.ok.canvas#standard-shortcuts-preserved"
  - ".ok/macos.ok.canvas#tl-c2hhcGU6S05hbnZ3WlBDdGZCQmdNR2RfaEJK"
gap_refs:
  - "gap-macos-menu-shortcuts-001"
---

# Refactor: preserve behavior and verify smoke coverage

Refactor only after green behavior exists, then run the relevant Swift and app smoke checks. Extend smoke coverage if needed so standard menu exposure is guarded.

Preferred delegate: `@gan-refactor`.
