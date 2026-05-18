---
id: task-macos-green-new-canvas-and-close-implementation
level: low
status: done
blocked_by: []
expires_at: 2026-05-25T13:25:24-04:00
ok_refs:
  - .ok/macos.ok.canvas#file-menu-new-canvas
  - .ok/macos.ok.canvas#new-canvas-command-n
gap_refs:
  - gap-macos-new-canvas-flow-001
  - gap-macos-command-w-close-001
---

# GREEN: macOS new canvas and close implementation

Assigned RGRTDD role: `@gan-green`.

Make the native new-canvas and close tests pass with the smallest safe AppKit implementation.

## Delegation

- 2026-05-18: delegated to `@gan-green`; owned paths: `macos/AppifyUI2026-canvas/Sources/Canvas/AppDelegate.swift` and this task file.

## GREEN evidence

- 2026-05-18: Reproduced red with `swift test --filter MacOSMenuTests` from `macos/AppifyUI2026-canvas`: 5 tests, 6 failures for missing Command-N canvas creation/opening path and File > Close / Command-W native close path.
- 2026-05-18: Implemented the smallest AppKit path in `AppDelegate.swift`: Command-N creates a unique `Untitled Canvas*.canvas` file, writes an empty JSON Canvas payload, then opens it; File > Close binds Command-W to `closeCurrentWindowFromMenu(_:)` which performs close on the current key/main window.
- 2026-05-18: Focused verification passed: `swift test --filter MacOSMenuTests` from `macos/AppifyUI2026-canvas` — 5 tests, 0 failures.
- 2026-05-18: Broader verification passed: `swift test` from `macos/AppifyUI2026-canvas` — 14 tests, 0 failures.
