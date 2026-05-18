---
id: task-style-adapter-color-semantics
level: medium
status: pending
blocked_by:
  - task-style-canvas-rendering-reconciliation
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
