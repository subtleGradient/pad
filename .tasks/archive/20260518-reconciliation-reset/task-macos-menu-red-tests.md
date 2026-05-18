---
id: task-macos-menu-red-tests
level: low
status: done
blocked_by: []
expires_at: "2026-05-25T00:00:00Z"
ok_refs:
  - ".ok/macos.ok.canvas#standard-top-level-menus"
  - ".ok/macos.ok.canvas#file-menu-new-canvas"
  - ".ok/macos.ok.canvas#new-canvas-command-n"
  - ".ok/macos.ok.canvas#standard-shortcuts-preserved"
gap_refs:
  - "gap-macos-menu-top-level-001"
  - "gap-macos-menu-new-canvas-001"
  - "gap-macos-menu-command-n-001"
  - "gap-macos-menu-shortcuts-001"
---

# Red: prove current menu behavior misses OK expectations

Add failing executable tests that assert top-level File/Edit/View/Window/Help menus, File > New Canvas, Command-N, and preservation of native standard shortcuts.

Preferred delegate: `@gan-red`.

## RED evidence — 2026-05-18

Perception GAN prior: current `AppDelegate.configureMainMenu()` likely only constructs the app menu plus File > Open, so the highest-signal falsification path is an executable test against the menu declarations rather than runner/window behavior.

Added focused Swift XCTest coverage in `macos/AppifyUI2026-canvas/Tests/CanvasCoreTests/MacOSMenuTests.swift` for:

- `.ok/macos.ok.canvas#standard-top-level-menus`: File/Edit/View/Window/Help top-level menus.
- `.ok/macos.ok.canvas#file-menu-new-canvas`: File > New Canvas.
- `.ok/macos.ok.canvas#new-canvas-command-n`: New Canvas uses Command-N (`keyEquivalent: "n"`).
- `.ok/macos.ok.canvas#standard-shortcuts-preserved`: representative native shortcuts including Undo/Cut/Copy/Paste/Select All/Minimize.

Verification command:

```sh
swift test --filter MacOSMenuTests
```

Observed RED result: build succeeded; `MacOSMenuTests` executed 3 tests with 12 assertion failures for the expected missing menu behavior, including missing New Canvas, missing Command-N, missing Edit/View/Window/Help menus, and missing standard native shortcut declarations. No syntax/build/runtime harness failure blocked the assertions.
