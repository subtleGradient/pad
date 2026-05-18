---
id: task-style-red-color-fixture-tests
level: low
status: pending
blocked_by: []
expires_at: 2026-05-25T13:25:24-04:00
ok_refs:
  - .ok/style.ok.canvas#color-1-red
  - .ok/style.ok.canvas#color-2-orange
  - .ok/style.ok.canvas#color-3-yellow-brown
  - .ok/style.ok.canvas#color-4-green
  - .ok/style.ok.canvas#color-5-cyan
  - .ok/style.ok.canvas#color-6-purple-burple
  - .ok/style.ok.canvas#hex-colors-preserve-hue
gap_refs:
  - gap-style-color-mapping-001
  - gap-style-node-edge-color-parity-001
---

# RED: color fixture tests

Assigned RGRTDD role: `@gan-red`.

Add failing Bun tests proving JSON Canvas preset strings `"1"` through `"6"`, default/no-color, and hex colors project to the expected tldraw node and edge colors without index shifts.

The tests should include the external regression fixture semantics from `/Users/tom/Developer/work/daily/2026/05/style.canvas` without requiring the test suite to depend on mutable external user files.
