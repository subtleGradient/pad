---
id: task-macos-native-menu-reconciliation
level: high
status: done
blocked_by: []
expires_at: "2026-05-25T00:00:00Z"
ok_refs:
  - ".ok/macos.ok.canvas#application-menus"
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

# Reconcile macOS native application menus

Bring the Canvas macOS app menu bar into alignment with `.ok/macos.ok.canvas` while preserving native platform expectations.

Done when File, Edit, View, Window, and Help are exposed, File contains New Canvas, New Canvas uses Command-N, and standard native shortcuts are protected by executable coverage.

## Completion evidence — 2026-05-18

The red, green, and refactor/smoke low-level tasks are done. Evidence includes passing `swift test --filter MacOSMenuTests`, passing full `swift test`, and passing `./Scripts/smoke-ui.sh` from `macos/AppifyUI2026-canvas`.
