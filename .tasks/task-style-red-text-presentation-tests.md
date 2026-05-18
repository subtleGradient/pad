---
id: task-style-red-text-presentation-tests
level: low
status: done
blocked_by: []
expires_at: 2026-05-25T13:25:24-04:00
ok_refs:
  - .ok/style.ok.canvas#text-nodes-use-sans-font
  - .ok/style.ok.canvas#text-align-left
  - .ok/style.ok.canvas#text-align-top
gap_refs:
  - gap-style-text-node-presentation-001
---

# RED: text presentation tests

Assigned RGRTDD role: `@gan-red`.

Add failing Bun tests that imported JSON Canvas text nodes project to sans font, left alignment, and top vertical alignment in tldraw props.

## Delegation

- 2026-05-18: delegated to `@gan-red`; owned paths: `pad.shebang.test.ts` and test-only fixtures/helpers if needed.

## RED evidence

- 2026-05-18: Added assertion-level Bun test `JSON Canvas tldraw adapter > projects JSON Canvas text nodes with sans font and top-left text alignment` in `pad.shebang.test.ts`.
- Command: `bun test pad.shebang.test.ts -t "projects JSON Canvas text nodes with sans font and top-left text alignment"`
- Observed intended RED failure: expected text-node tldraw props `{ font: "sans", align: "start", verticalAlign: "start" }`, but current adapter produced `font: "draw"`, `align: "middle"`, and `verticalAlign: "middle"`.
