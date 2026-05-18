---
id: task-macos-red-new-canvas-and-close-tests
level: low
status: done
blocked_by: []
expires_at: 2026-05-25T13:25:24-04:00
ok_refs:
  - .ok/macos.ok.canvas#tl-c2hhcGU6Q3dfX1lURW8za1ExcU95M2JTak1N
  - .ok/macos.ok.canvas#tl-c2hhcGU6T1U4S1VBbFNfRnhqTkI4QnhNdUct
gap_refs:
  - gap-macos-new-canvas-flow-001
  - gap-macos-command-w-close-001
---

# RED: macOS new canvas and close tests

Assigned RGRTDD role: `@gan-red`.

Add failing Swift tests proving Command-N has an implementation path that creates and opens a new `.canvas` file, and Command-W has a native close menu/action path for the current window.

## Delegation

- 2026-05-18: delegated to `@gan-red`; owned paths: `macos/AppifyUI2026-canvas/Tests/CanvasCoreTests/MacOSMenuTests.swift` and test-only Swift seams if needed.

## RED evidence

- 2026-05-18: Added assertion-level Swift coverage in `MacOSMenuTests` for the missing Command-N implementation path and Command-W close path.
- Command run from `macos/AppifyUI2026-canvas`: `swift test --filter MacOSMenuTests`.
- Build succeeded, existing menu tests passed, and the new RED tests failed for the intended reasons:
  - `testNewCanvasMenuActionCreatesAndOpensCanvasFile` failed because `newCanvasFromMenu(_:)` does not create a `.canvas` file, persist it, or call `openDocument(at:)`.
  - `testFileMenuContainsNativeCloseBoundToCommandW` failed because no File > Close item, `keyEquivalent: "w"`, or explicit current-window close action path exists.
