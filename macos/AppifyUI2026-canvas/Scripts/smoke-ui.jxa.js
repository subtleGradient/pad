#!/usr/bin/env -S osascript -l JavaScript

function run(argv) {
  const appPath = argv[0]
  const expectedBundleIdentifier = argv[1]
  const documentPath = argv[2]
  const app = Application.currentApplication()
  app.includeStandardAdditions = true

  const systemEvents = Application("System Events")
  const deadline = Date.now() + 8000

  const shellQuote = value => `'${String(value).replace(/'/g, "'\\''")}'`
  const delaySeconds = seconds => delay(seconds)
  const canvasProcesses = () => systemEvents.processes.whose({ name: "Canvas" })()
  const canvasProcess = () => canvasProcesses()[0]
  const canvasWindowCount = () => {
    const source = `
import CoreGraphics

let windows = CGWindowListCopyWindowInfo([.optionOnScreenOnly], kCGNullWindowID) as? [[String: Any]] ?? []
let count = windows.filter { window in
  (window[kCGWindowOwnerName as String] as? String) == "Canvas"
    && (window[kCGWindowLayer as String] as? Int ?? -1) == 0
    && (window[kCGWindowIsOnscreen as String] as? Int ?? 0) == 1
}.count
print(count)
`
    return Number(app.doShellScript(`swift -e ${shellQuote(source)}`).trim())
  }
  const visibleCanvasWindow = process => {
    if (process.windows.length > 0) return true
    return canvasWindowCount() > 0
  }
  const fail = message => {
    throw new Error(message)
  }
  const waitUntil = (message, predicate) => {
    while (Date.now() <= deadline) {
      const value = predicate()
      if (value) return value
      delaySeconds(0.1)
    }
    fail(message)
  }
  const quitApp = () => {
    try {
      Application("Canvas").quit()
      delaySeconds(0.2)
    } catch (_) {}
    try {
      app.doShellScript(`pkill -f ${shellQuote(`${appPath}/Contents/MacOS/Canvas`)}`)
      delaySeconds(0.2)
    } catch (_) {}
  }
  const openApp = extraArguments => {
    if (extraArguments) {
      app.doShellScript(`open -n -a ${shellQuote(appPath)} ${extraArguments}`)
    } else {
      app.doShellScript(`open -n ${shellQuote(appPath)}`)
    }
  }
  const assertLegitProcess = () => {
    const process = waitUntil("Canvas process did not appear", () => canvasProcess())
    process.frontmost = true

    waitUntil("Canvas bundle identifier was not visible", () => process.bundleIdentifier())
    const bundleIdentifier = process.bundleIdentifier()
    if (bundleIdentifier !== expectedBundleIdentifier) {
      fail(`Expected bundle identifier ${expectedBundleIdentifier} but saw ${bundleIdentifier}`)
    }

    try {
      Application("Canvas").activate()
      delaySeconds(0.2)
      process.frontmost = true
    } catch (_) {}

    waitUntil("Canvas has no menu bar", () => process.menuBars.length > 0)

    const menuBar = process.menuBars[0]
    if (menuBar.menuBarItems.whose({ name: "File" })().length < 1) {
      fail("Canvas has no File menu")
    }
    if (menuBar.menuBarItems.whose({ name: "Canvas" })().length < 1) {
      fail("Canvas has no application menu")
    }

    return process
  }

  quitApp()

  try {
    openApp("")
    let process = assertLegitProcess()
    waitUntil("Canvas did not present a window or open panel", () => visibleCanvasWindow(process))
    let windowName = process.windows.length > 0 ? process.windows[0].name() : "Open Canvas"
    if (process.windows.length > 0 && windowName !== "Open Canvas") {
      fail(`Expected direct-launch open panel named Open Canvas but saw ${windowName}`)
    }
    quitApp()

    if (documentPath) {
      openApp(shellQuote(documentPath))
      process = assertLegitProcess()
      waitUntil("Canvas did not present the document window", () => visibleCanvasWindow(process))
      windowName = process.windows.length > 0 ? process.windows[0].name() : "Hello"
      if (process.windows.length > 0 && windowName !== "Hello") {
        fail(`Expected Hello document window but saw ${windowName}`)
      }

      delaySeconds(2)
      if (canvasProcesses().length < 1) {
        fail("Canvas exited while opening Hello.canvas")
      }

      return `Canvas document smoke ok: ${documentPath}`
    }

    quitApp()
    return `Canvas smoke ok: ${appPath}`
  } catch (error) {
    quitApp()
    throw error
  }
}
