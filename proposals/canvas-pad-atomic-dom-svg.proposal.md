# Canvas PAD Atomic DOM+SVG Proposal

Date: 2026-05-08

Baseline: `/Users/tom/Developer/obsidian/canvas.spec.md`

## Decision

Build the PAD `.canvas` editor as a local Bun runner with atomic custom elements, DOM cards, and an SVG edge layer. Keep JSON Canvas as the only durable format. Treat tldraw as a viable optional adapter once the JSON Canvas persistence boundary is stable.

The shipped first slice should support:

- `npx pad ./file.canvas` style launch through the existing `pad` bin.
- No shebang in `.canvas` files.
- Direct read/write of JSON Canvas with tab-indented JSON.
- Unknown root, node, and edge fields preserved.
- Text, file, link, group nodes rendered as web components.
- DOM editing for text/group labels.
- SVG cubic Bezier edge rendering with arrowheads and labels.
- Pan, zoom, fit, create, move, resize, delete, and autosave.

## Branch Mining

`pad-oc` is useful for its direction, not for a wholesale merge. It adds a modular browser runtime, document-kind thinking, editable-state gating, and custom-element composition. It also pulls in OpenCode/chat concerns and `@opencode-ai/sdk`, which are unrelated to `.canvas` and make the single-command canvas package heavier.

`pad-diff` is useful as a custom-element CRUD experiment. Its generated IDs, runtime-only controls, semantic sections, and autosave discipline transfer well. The diff grammar itself should not merge into the canvas path.

The tldraw prototypes under `/Users/tom/Developer/work/projects/reconciliation` provide two concrete lessons:

- Native tldraw arrows plus bindings are the right tldraw-side primitive for future edge authoring.
- The server must keep semantic persistence separate from renderer snapshots; tldraw records should be projection/cache, not the canonical file.

## tldraw License Clarification

Current tldraw 4.x docs distinguish local development from production deployment:

- Publishing an open-source GitHub project that imports tldraw is allowed, but the tldraw SDK remains under the tldraw license.
- Running the project locally through `bunx` on `localhost`/HTTP is development use and does not require a license key.
- Downstream users need their own trial, commercial, or hobby license key only when they use the SDK in production.
- A public hosted deployment of the canvas editor would require a valid tldraw key. Commercial production use requires a commercial license; non-commercial production use may qualify for a discretionary hobby license with the watermark.

Sources: [tldraw License](https://tldraw.dev/community/license), [License key docs](https://tldraw.dev/sdk-features/license-key), [tldraw SDK License](https://tldraw.dev/legal/tldraw-license).

## Proposal Ranking

Quads-PREP prior: tldraw would probably win because it already solves infinite-canvas editor ergonomics.

Perception falsification: PAD's central product constraint is a tiny local file runner and a plain `.canvas` source file. tldraw improves editing speed, but adds a large React/tldraw dependency surface before the JSON Canvas adapter is proven. Its production-license constraint matters for hosted deployments, not for publishing GitHub source that users run locally with `bunx`.

Stability stress test: the architecture that survives renderer swaps is a JSON Canvas core plus host adapter plus atomic card/edge components. That core can feed DOM+SVG now and tldraw later.

Judgment audit: start with DOM+SVG because it is easiest to inspect, ship through `npx`, and align with current PAD patterns. Add tldraw-specific web components after the canonical model and tests are stable.

| Rank | Proposal | Thing Golf | Decision Golf | Verdict |
|---:|---|---:|---:|---|
| 1 | Atomic DOM+SVG / Web Components | 4 | 1 | Best first PAD implementation. |
| 2 | tldraw adapter plus atomic components | 6 | 2 | Best acceleration path after core format tests exist. |
| 3 | React Flow | 10 | 4 | Good React graph editor, weaker PAD pattern fit. |
| 4 | Konva/Fabric from other-tech | 11 | 5 | Useful fallback, still custom embed/edge work. |
| 5 | Zero-dependency Canvas 2D/WebGL variants | 13 | 6 | Good for scale, worse for rich embeds/editing. |
| 6 | deck.gl | 16 | 8 | Strong renderer, too visualization-shaped for first editor. |

Thing Golf notes:

- DOM+SVG adds technical burden, but avoids dependency/licensing burden and keeps the source legible.
- tldraw lowers interaction implementation burden. For our GitHub-plus-local-`bunx` distribution, license risk is limited; the real risks are React bundle size, adapter discipline, and snapshot drift. Hosted production deployments still need a tldraw license key.
- React Flow/Konva/Fabric all still require custom JSON Canvas persistence, host embeds, rename propagation, and search integration.
- deck.gl is overpowered for the editor slice and would move complexity into DOM overlay synchronization.

Decision Golf notes:

- The calibrated move is to prove canonical JSON Canvas load/edit/save first.
- The exposure risk is committing to a renderer-specific snapshot too early.
- The fluid path is to expose atomic component contracts that tldraw can later consume or replace.

## Architecture

```text
file.canvas
  -> Bun runner
  -> JSON Canvas parser / serializer
  -> browser WebSocket session
  -> <json-canvas-editor>
  -> <json-canvas-node> DOM cards
  -> SVG edge layer
  -> autosave JSON Canvas
```

The browser runtime owns view state only. The server owns file IO and canonical serialization.

Core invariants:

- `nodes` and `edges` are created if missing or invalid.
- Unknown object fields are not stripped.
- Unsupported node records remain in the JSON array but are not rendered.
- Invalid or unresolved edges are skipped in rendering without crashing.
- Geometry fields are rounded before saving.
- Viewport, selection, read-only state, and fold state never enter the `.canvas` file.

## Atomic Components

First slice:

- `json-canvas-editor`: file session, toolbar, viewport, command dispatch, autosave.
- `json-canvas-node`: shared card shell, geometry, selection, resize.
- `json-canvas-status`: runtime status.

Next tldraw-oriented slice:

- `tl-json-canvas-editor`: tldraw host that imports/exports JSON Canvas.
- `tl-json-canvas-card`: subatomic shape renderer for text/file/link cards.
- `tl-json-canvas-group`: group/frame-like shape adapter.
- `tl-json-canvas-arrow-adapter`: native tldraw arrow and binding mapper for JSON Canvas edges.
- `json-canvas-edge-model`: renderer-neutral edge side/end/label/color adapter.

The tldraw web components should be projection components. They should not persist tldraw snapshots into `.canvas`.

## Implementation Phases

1. Land PAD `.canvas` runner and DOM+SVG editor MVP.
2. Add golden tests for unknown-field preservation and JSON Canvas fixtures.
3. Add file/link/group property menus, edge creation/reconnection, clipboard fragments, and undo snapshots.
4. Add host adapters for Markdown rendering, file previews, search index, backlinks, and rename propagation.
5. Add tldraw adapter components behind the same JSON Canvas core if the editing surface needs faster advanced interaction.

## Open Risks

- Full spec parity still needs edge authoring, snap guides, clipboard MIME, PNG export, search/backlink adapters, and richer file embeds.
- DOM+SVG will need virtualization for large canvases.
- tldraw remains attractive, but only after the JSON Canvas adapter has fixture coverage.
