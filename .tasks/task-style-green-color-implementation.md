---
id: task-style-green-color-implementation
level: low
status: pending
blocked_by:
  - task-style-adapter-color-semantics
  - task-style-red-color-fixture-tests
expires_at: 2026-05-25T13:25:24-04:00
ok_refs:
  - .ok/style.ok.canvas#colors-match-json-canvas-spec
  - .ok/style.ok.canvas#node-edge-color-parity
gap_refs:
  - gap-style-color-mapping-001
---

# GREEN: color implementation

Assigned RGRTDD role: `@gan-green`.

Make the red color tests pass with the smallest safe adapter change. Preserve JSON Canvas round-trip fields and keep existing Bun tests green.
