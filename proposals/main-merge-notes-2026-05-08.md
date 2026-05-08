# Main Merge Notes

Date: 2026-05-08

## Current State

`main` has been fast-forwarded through `v0-dev`, including the JSON Canvas runner/editor work.

Selective side-branch material merged into `main`:

- From `pad-oc`: modular browser runtime shape, editable-state gating, list normalization primitives, and PAD layout elements.
- From `pad-diff`: generic PAD semantic element surface and low-distraction styling patterns for scopes, notes, expectations, snapshots, work blocks, refs, and metrics.

## Deliberately Skipped

- `pad-oc` OpenCode chat/session continuation: useful, but adds `@opencode-ai/sdk`, `.chat.html`, and extra document-kind conflicts.
- `pad-oc` Puppeteer browser test dependency: useful later, but expands install/test footprint.
- `pad-diff` root `SPEC.pad.htm` replacement and `pad-diff.diff.pad.htm`: too roadmap/dogfood-heavy for `main`.
- `pad-diff` full story/diff CRUD grammar: keep the generic PAD element surface first; revisit branch-specific workflow grammar later.

## Follow-Up

- Consider a separate branch for OpenCode chat once `PadDocumentKind = "pad" | "canvas" | "chat"` is designed cleanly.
- If generic PAD scopes become central, port the richer `pad-diff` runtime controls in a focused pass with tests.
- Add browser-level tests only when the dependency/runtime choice is intentional.
