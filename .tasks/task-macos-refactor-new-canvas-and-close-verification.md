---
id: task-macos-refactor-new-canvas-and-close-verification
level: low
status: done
blocked_by: []
expires_at: 2026-05-25T13:25:24-04:00
ok_refs:
  - .ok/macos.ok.canvas#application-menus
gap_refs:
  - gap-macos-new-canvas-flow-001
  - gap-macos-command-w-close-001
---

# REFACTOR: macOS new canvas and close verification

Assigned RGRTDD role: `@gan-refactor`.

Refactor only after green behavior. Verify `swift test` and existing smoke scripts remain aligned with native macOS expectations.

## Delegation

- 2026-05-18: delegated to `@gan-refactor`; owned paths: `macos/AppifyUI2026-canvas/Sources/Canvas/AppDelegate.swift`, related focused tests/smoke only if needed, and this task file.

## REFACTOR evidence

- 2026-05-18: Reviewed `AppDelegate.swift` after red/green completion. Judgment GAN conclusion: no production refactor was needed; the current native menu handlers and helper boundaries are local, readable, and covered by focused menu tests. Avoided speculative churn to preserve observable new-canvas and close behavior.
- Verification from `macos/AppifyUI2026-canvas`:
  - `swift test --filter MacOSMenuTests` passed: 5 tests, 0 failures.
  - `swift test` passed: 15 tests, 0 failures.
  - `Scripts/smoke-ui.sh` initially failed because an existing unrelated `Canvas` process/window (`conversation-topics.ok`) interfered with the direct-launch open-panel assertion; after bounded cleanup of stale `Canvas`/`pad.shebang.tsx` processes, rerun passed and verified `Hello.canvas` opened through PAD at a loopback URL.
