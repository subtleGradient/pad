# macOS JSON Canvas App and Quick Look Packaging

Date: 2026-05-08

## Goal

Ship PAD as a self-distributed macOS `.app` that:

- Owns `.canvas` files as JSON Canvas documents.
- Opens `.canvas` files on double-click.
- Shows in the Dock as a normal Mac app.
- Embeds Quick Look preview and thumbnail extensions for `.canvas`.
- Uses a tiny native Swift shell around the existing Bun PAD editor.
- Does not require launching Xcode.
- Does not use Electron, Tauri, or another app framework.

## Invalidation Verdict

The core app idea survives, but the installer/registration story needs tightening.

Valid:

- A minimal AppKit + `WKWebView` app is enough. The native app only needs to receive file-open events, spawn the PAD Bun runner with `PAD_NO_OPEN=1`, and load the emitted localhost URL.
- The app does not need to live in `/Applications`. Launch Services can register an app bundle by URL.
- Quick Look support should be app extensions embedded in the containing app, not a legacy standalone `.qlgenerator`.
- A `bunx` or `npx` one-liner can be the user-facing installation and launch surface.
- Self-distribution outside the Mac App Store is compatible with app extensions, but Gatekeeper requires the containing app to be opened and approved before the extension is available.

Invalid or fragile:

- Treating a transient `bunx`/`npx` cache path as the permanent app location. Launch Services can remember that path, but package-manager caches are allowed to move, dedupe, evict, or be cleaned. Double-clicking `.canvas` files then points at a stale app URL.
- Treating `qlmanage -r` as the thing that registers the extension. `qlmanage` resets Quick Look state; app/extension discovery comes from the app bundle being registered and approved.
- Running the full Bun/tldraw editor from Quick Look. Preview and thumbnail extensions should be static, fast, network-independent, and not depend on a local WebSocket server.
- Assuming document ownership follows from launch alone. To make double-click deterministic, the app must both declare the document type and request/set itself as the default handler for the `.canvas` content type.

Corrected installer model:

```sh
bunx --bun @subtlegradient/pad-macos install
```

The package-manager install is the transport. The `install` command should place or verify a notarized `Pad.app` at a stable per-user path, then register and launch it. Use a path like:

```text
~/Library/Application Support/PAD/Apps/<version>/Pad.app
```

This still avoids `/Applications`, still starts from a one-liner, and avoids relying on a cache path as a durable Launch Services target. If the hard requirement is "register the app directly inside the `bunx`/`npx` cache and never copy or materialize it elsewhere", that requirement is invalid for a durable file association.

## Sources Checked

Apple and Swift primary docs:

- Quick Look UI: https://developer.apple.com/documentation/quicklookui
- `QLPreviewProvider`: https://developer.apple.com/documentation/quicklookui/qlpreviewprovider
- Quick Look thumbnails: https://developer.apple.com/documentation/quicklookthumbnailing/providing-thumbnails-of-your-custom-file-types
- App extensions overview: https://developer.apple.com/documentation/technologyoverviews/app-extensions
- Bundle content placement: https://developer.apple.com/documentation/bundleresources/placing-content-in-a-bundle
- Launch Services: https://developer.apple.com/documentation/coreservices/launch_services
- `NSWorkspace.setDefaultApplication`: https://developer.apple.com/documentation/appkit/nsworkspace/setdefaultapplication(at:toopen:completion:)
- Uniform type declarations: https://developer.apple.com/documentation/uniformtypeidentifiers/defining-file-and-data-types-for-your-app
- `CFBundleDocumentTypes`: https://developer.apple.com/documentation/BundleResources/Information-Property-List/CFBundleDocumentTypes
- macOS notarization: https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution
- Notarization issues: https://developer.apple.com/documentation/security/resolving-common-notarization-issues
- Swift 6.2 release notes: https://www.swift.org/blog/swift-6.2-released
- Swift API Design Guidelines: https://www.swift.org/documentation/api-design-guidelines/
- SwiftPM command-line build docs: https://www.swift.org/getting-started/cli-swiftpm/
- Xcode build settings reference for Approachable Concurrency flags: https://developer.apple.com/documentation/xcode/build-settings-reference

Package-manager docs:

- Bun `bunx`: https://bun.sh/docs/cli/bunx
- Bun install/cache behavior: https://bun.sh/docs/cli/install
- npm package files: https://docs.npmjs.com/cli/v11/commands/npm-publish
- npm `package.json` fields: https://docs.npmjs.com/cli/v11/configuring-npm/package-json
- npm `npx`: https://docs.npmjs.com/cli/v8/commands/npx

JSON Canvas docs:

- Format home: https://jsoncanvas.org/
- Spec 1.0: https://jsoncanvas.org/spec/1.0/

## Native Swift Standard

This should be Swift 6.2-style code, not just "typical" Swift:

- Build with SwiftPM or direct `swiftc` scripts from the terminal. Never require opening Xcode.
- Use Swift 6 language mode.
- For the app target, use default actor isolation of `MainActor`; this matches Apple's current guidance for UI-focused modules.
- Enable Approachable Concurrency's upcoming-feature set when the toolchain needs explicit flags: `DisableOutwardActorInference`, `GlobalActorIsolatedTypesUsability`, `InferIsolatedConformances`, `InferSendableFromCaptures`, and `NonisolatedNonsendingByDefault`.
- Keep the app module deliberately main-threaded until profiling proves work needs to move off the main actor.
- Use `@concurrent` only for real background work. Spawning the Bun process and loading a web view do not require a complex concurrency model.
- Prefer value structs for immutable launch configuration and document URLs.
- Use typed errors for expected failures: missing bundled Bun, unreadable document URL, runner failed to print a URL, WebView load failure.
- Use `Process`, `Pipe`, `WKWebView`, `NSWindowController`, and `NSWorkspace` directly. No dependency framework.
- Prefer `URL` and `UTType` APIs over stringly path/type handling at the app boundary.
- Keep Quick Look renderer code extension-safe. Do not link extension targets against code that imports `AppKit` unless that target actually needs it; thumbnail drawing can use CoreGraphics.
- Avoid shared mutable globals. Where state is necessary, put it in a `@MainActor` controller object with explicit lifetime tied to a window or extension request.
- Follow Swift API design guidelines: names should optimize clarity at use sites, not abbreviations.
- Use `#fileID` in diagnostics that can ship to users.

Sketch of the SwiftPM settings:

```swift
// swift-tools-version: 6.2
import PackageDescription

let appSwiftSettings: [SwiftSetting] = [
  .swiftLanguageMode(.v6),
  .defaultIsolation(MainActor.self),
  .enableUpcomingFeature("DisableOutwardActorInference"),
  .enableUpcomingFeature("GlobalActorIsolatedTypesUsability"),
  .enableUpcomingFeature("InferIsolatedConformances"),
  .enableUpcomingFeature("InferSendableFromCaptures"),
  .enableUpcomingFeature("NonisolatedNonsendingByDefault"),
]
```

If the installed Swift toolchain already enables some of these under Swift 6, keep the manifest quiet by conditionally maintaining a minimal tested set. The intent is the invariant, not ceremony: strict Swift 6 data-race safety, main-actor UI, explicit concurrency only where needed.

## Bundle Shape

Target bundle layout:

```text
Pad.app/
  Contents/
    Info.plist
    MacOS/
      Pad
      bun
    Resources/
      pad/
        pad.shebang.tsx
        canvas.browser.js
        canvas.css
        canvas.preview.js
        canvas.tldraw.adapter.js
        browser/
    PlugIns/
      PadCanvasPreview.appex/
      PadCanvasThumbnail.appex/
```

Apple's bundle placement docs reserve `Contents/PlugIns/` for macOS app extensions and `Contents/MacOS/` for executable code. Put Bun in `Contents/MacOS/` unless signing/notarization testing proves a better helper location. Avoid nonstandard nested executable layouts.

The native `Pad` executable is the document shell. It handles Launch Services open events, starts the bundled PAD runner with `PAD_NO_OPEN=1`, reads the printed local server URL, and loads it in a `WKWebView`.

The app should be a normal foreground app:

- Do not set `LSUIElement`.
- Use `NSApplication.ActivationPolicy.regular` if the command-line build path needs explicit activation.
- Call `NSApp.activate(ignoringOtherApps: true)` after creating the first document window when launched by the installer.

## Build Without Launching Xcode

Use a scripted build:

```sh
swift build -c release
bun run macos:bundle
bun run macos:codesign
bun run macos:notarize
```

The bundle script should:

1. Compile the Swift app and extension binaries.
2. Create `Pad.app` and `.appex` directory structures.
3. Generate `Info.plist` files with `plutil` or a small deterministic script.
4. Copy PAD browser/runtime assets.
5. Copy a known Bun binary.
6. Sign nested code from the inside out.
7. Verify signatures with `codesign -vvv --deep --strict`.
8. Notarize with `xcrun notarytool`.
9. Staple the notarization ticket.
10. Zip the final app for npm package inclusion.

No Xcode project is required unless app-extension packaging proves materially easier with `xcodebuild`. Even then, the bar is "command-line Xcode build tools are acceptable"; launching the Xcode app is not.

## Uniform Type and Document Registration

The JSON Canvas docs define the `.canvas` extension and JSON object shape. I did not find an official macOS UTI or MIME type in those docs on 2026-05-08, so the first app bundle can declare an app-owned UTI. If the JSON Canvas project later publishes an official UTI, switch this to `UTImportedTypeDeclarations` and use that identifier in every `LSItemContentTypes` and `QLSupportedContentTypes` list.

Declare the initial app-owned type in the app's `Info.plist`:

```xml
<key>UTExportedTypeDeclarations</key>
<array>
  <dict>
    <key>UTTypeIdentifier</key>
    <string>com.subtlegradient.pad.canvas</string>
    <key>UTTypeDescription</key>
    <string>JSON Canvas</string>
    <key>UTTypeConformsTo</key>
    <array>
      <string>public.json</string>
    </array>
    <key>UTTypeTagSpecification</key>
    <dict>
      <key>public.filename-extension</key>
      <array>
        <string>canvas</string>
      </array>
    </dict>
  </dict>
</array>
```

Then claim that type as an editable document:

```xml
<key>CFBundleDocumentTypes</key>
<array>
  <dict>
    <key>CFBundleTypeName</key>
    <string>JSON Canvas</string>
    <key>CFBundleTypeRole</key>
    <string>Editor</string>
    <key>LSHandlerRank</key>
    <string>Owner</string>
    <key>LSItemContentTypes</key>
    <array>
      <string>com.subtlegradient.pad.canvas</string>
    </array>
  </dict>
</array>
```

Registration flow:

1. Launch or register the stable `Pad.app` URL.
2. Call Launch Services registration for the app URL.
3. Ask `NSWorkspace.shared.setDefaultApplication(at: appURL, toOpen: canvasUTType)` to make PAD the default `.canvas` handler. The system may ask for user consent.
4. Verify with `NSWorkspace.shared.urlForApplication(toOpen: canvasUTType)`.

Do not rely on `LSHandlerRank=Owner` alone when another app has already claimed `.canvas`.

## Quick Look Preview Extension

Use a data-based Quick Look Preview Extension:

```xml
<key>NSExtension</key>
<dict>
  <key>NSExtensionPointIdentifier</key>
  <string>com.apple.quicklook.preview</string>
  <key>NSExtensionPrincipalClass</key>
  <string>$(PRODUCT_MODULE_NAME).PreviewProvider</string>
  <key>NSExtensionAttributes</key>
  <dict>
    <key>QLIsDataBasedPreview</key>
    <true/>
    <key>QLSupportedContentTypes</key>
    <array>
      <string>com.subtlegradient.pad.canvas</string>
    </array>
  </dict>
</dict>
```

Provider behavior:

1. Read `request.fileURL`.
2. Parse only enough JSON Canvas to draw text/file/link/group nodes and edges.
3. Generate static HTML/SVG.
4. Return `QLPreviewReply(dataOfContentType: .html, contentSize: CGSize(width: 1100, height: 800))`.

PAD has `canvas.preview.js` and `pad --canvas-preview-html ./file.canvas` as the reference renderer. For a shippable app extension, prefer porting this small renderer to Swift over shelling out to Bun from the extension. The app can still use Bun for the full editor.

## Quick Look Thumbnail Extension

Add a separate Thumbnail Extension using `QLThumbnailProvider` with:

```xml
<key>NSExtension</key>
<dict>
  <key>NSExtensionPointIdentifier</key>
  <string>com.apple.quicklook.thumbnail</string>
  <key>NSExtensionPrincipalClass</key>
  <string>$(PRODUCT_MODULE_NAME).ThumbnailProvider</string>
  <key>NSExtensionAttributes</key>
  <dict>
    <key>QLSupportedContentTypes</key>
    <array>
      <string>com.subtlegradient.pad.canvas</string>
    </array>
    <key>QLThumbnailMinimumDimension</key>
    <integer>64</integer>
  </dict>
</dict>
```

Thumbnail behavior should share normalized node/edge geometry and draw a compact CoreGraphics version: background, node rectangles, and edge lines. It does not need text fidelity at Finder icon sizes.

## Native App Open Flow

AppKit entrypoints:

- `applicationDidFinishLaunching(_:)`: prepare the app and create an empty window only if no document open event arrives.
- `application(_:open:)`: open each `.canvas` URL.
- One window per document is simplest.

Window flow:

1. Spawn bundled runner with:

   ```text
   PAD_NO_OPEN=1 Pad.app/Contents/MacOS/bun Pad.app/Contents/Resources/pad/pad.shebang.tsx /absolute/file.canvas
   ```

2. Read stdout until the existing runner prints:

   ```text
   file.canvas: http://127.0.0.1:<port>/?t=<token>
   ```

3. Load that URL in `WKWebView`.
4. Terminate the child process when the window closes.

This keeps the current autosave and file-watching behavior unchanged.

## npm/bun Distribution

Publish a platform package, for example `@subtlegradient/pad-macos`, with:

```json
{
  "name": "@subtlegradient/pad-macos",
  "version": "0.1.0",
  "type": "module",
  "bin": {
    "pad-macos": "./bin/pad-macos.js"
  },
  "os": ["darwin"],
  "cpu": ["arm64", "x64"],
  "files": [
    "bin/",
    "dist/Pad.app.zip",
    "README.md",
    "package.json"
  ]
}
```

One-liners:

```sh
bunx --bun @subtlegradient/pad-macos install
npx @subtlegradient/pad-macos install
```

CLI behavior:

1. Resolve its package directory.
2. Expand `dist/Pad.app.zip` to a stable per-user install root.
3. Verify the app's code signature and notarization status.
4. Register the stable app URL with Launch Services.
5. Ask `NSWorkspace` to make PAD the default `.canvas` handler.
6. Launch the app so the user approves it and Quick Look extensions become available.
7. Run `qlmanage -r` and `qlmanage -r cache` only as a refresh step, not as the primary registration mechanism.
8. Print the installed app path and verification commands.

The package can include the `.app` bundle directly, but zip is safer for preserving bundle structure through npm packing and extraction.

## Verification

After install:

```sh
open "$HOME/Library/Application Support/PAD/Apps/0.1.0/Pad.app"
mdls -name kMDItemContentType examples/jsoncanvas-stress.canvas
open examples/jsoncanvas-stress.canvas
qlmanage -r
qlmanage -r cache
qlmanage -p examples/jsoncanvas-stress.canvas
qlmanage -t examples/jsoncanvas-stress.canvas
pluginkit -m -p com.apple.quicklook.preview
pluginkit -m -p com.apple.quicklook.thumbnail
codesign -vvv --deep --strict "$HOME/Library/Application Support/PAD/Apps/0.1.0/Pad.app"
spctl -vvv --assess --type exec "$HOME/Library/Application Support/PAD/Apps/0.1.0/Pad.app"
```

Programmatic checks:

- `NSWorkspace.shared.urlForApplication(toOpen: canvasUTType)` returns the stable installed `Pad.app`.
- `NSWorkspace.shared.urlsForApplications(toOpen: canvasUTType)` includes `Pad.app`.
- Double-clicking a `.canvas` fixture opens the stable installed app, not a package-manager cache path.

## Implementation Sequence

1. Keep `canvas.preview.js` green and deterministic as the reference renderer.
2. Add terminal-only Swift build and bundle scripts.
3. Build the minimal AppKit `WKWebView` shell.
4. Add app plist type declarations and document open handling.
5. Add the npm/bun package with a stable per-user installer command.
6. Implement Launch Services registration and `NSWorkspace` default-handler request.
7. Port the static preview renderer to Swift for the Quick Look preview extension.
8. Implement the thumbnail extension with CoreGraphics.
9. Sign, notarize, staple, and pack `Pad.app.zip`.
10. Verify install, Quick Look, and double-click behavior from the one-liner.

