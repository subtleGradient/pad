---
id: task-style-adapter-color-semantics
level: medium
status: done
blocked_by: []
expires_at: 2026-05-25T13:25:24-04:00
ok_refs:
  - .ok/style.ok.canvas#colors-match-json-canvas-spec
  - .ok/style.ok.canvas#no-color-index-shift
  - .ok/style.ok.canvas#node-edge-color-parity
  - .ok/style.ok.canvas#hex-colors-preserve-hue
gap_refs:
  - gap-style-color-mapping-001
  - gap-style-node-edge-color-parity-001
---

# Adapter color semantics

Bring `canvas.tldraw.adapter.js` color projection into compliance with JSON Canvas preset and hex-color expectations for both nodes and edges.

RGRTDD order: red tests, green implementation, refactor verification.

## Completion evidence

- 2026-05-18: `task-style-red-color-fixture-tests`, `task-style-green-color-implementation`, and `task-style-refactor-color-rendering` are done.
- Final verification: `bun test` passed with 54 tests and 0 failures.
