# Canvas

SwiftPM macOS document launcher for PAD JSON Canvas files.

Build the command-line Swift target:

```sh
swift build
```

Run tests:

```sh
swift test
```

Build the macOS app bundle:

```sh
Scripts/build-app.sh
```

Register `Canvas.app` as the global default app for `.canvas` files:

```sh
Scripts/register-default.sh
```

Run the end-to-end UI smoke test:

```sh
Scripts/smoke-ui.sh
```

The bundle is emitted at `dist/Canvas.app`, declares `.canvas` as `com.subtlegradient.pad.canvas`, and opens plain JSON Canvas files through the PAD Bun runner in a native `WKWebView`.

When `Canvas.app` is built inside this PAD checkout, it runs the local `pad.shebang.tsx`. When copied outside the checkout, it falls back to the pinned remote PAD package in `CanvasCore.RunnerCommandBuilder.pinnedRemotePackage`.
