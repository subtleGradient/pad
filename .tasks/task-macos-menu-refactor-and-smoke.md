---
id: task-macos-menu-refactor-and-smoke
level: low
status: done
blocked_by: []
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

## Refactor evidence — 2026-05-18

- Judgment GAN refactor pass found menu-related source structure acceptable for the scoped requirement; no menu source refactor was needed.
- Existing `MacOSMenuTests` guard standard top-level menus, Command-N New Canvas, and native Edit/Window shortcuts from `.ok/macos.ok.canvas#standard-shortcuts-preserved`.
- Ran `swift test` from `macos/AppifyUI2026-canvas`: 12 tests passed, 0 failures.
- Ran project smoke command `./Scripts/smoke-ui.sh` from `macos/AppifyUI2026-canvas`: app signature valid, Canvas document smoke passed, PAD WebSocket loaded `Hello.canvas`, and PAD opened `Hello.canvas` through loopback URL.
- Pre-existing uncommitted source changes in `Sources/Canvas/AppDelegate.swift` and `Sources/Canvas/DocumentWindowController.swift` were inspected and left untouched.
