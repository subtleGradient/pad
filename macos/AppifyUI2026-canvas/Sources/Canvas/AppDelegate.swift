import AppKit
import UniformTypeIdentifiers

final class AppDelegate: NSObject, NSApplicationDelegate {
    private var documentControllers: [ObjectIdentifier: DocumentWindowController] = [:]
    private var didReceiveDocumentOpenEvent = false
    private var openPanel: NSOpenPanel?

    func applicationDidFinishLaunching(_ notification: Notification) {
        configureMainMenu()

        DispatchQueue.main.async { [weak self] in
            guard let self, !self.didReceiveDocumentOpenEvent else {
                return
            }
            self.activateApplication()
            self.showOpenPanel()
        }
    }

    func application(_ application: NSApplication, open urls: [URL]) {
        DispatchQueue.main.async { [weak self] in
            guard let self else {
                return
            }
            self.didReceiveDocumentOpenEvent = true
            for url in urls {
                self.openDocument(at: url)
            }
            self.activateApplication()
        }
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        false
    }

    @objc private func openDocumentFromMenu(_ sender: Any?) {
        DispatchQueue.main.async { [weak self] in
            self?.showOpenPanel()
        }
    }

    @objc private func newCanvasFromMenu(_ sender: Any?) {
        // Creation flow is not implemented yet; keep the native menu item wired.
    }

    @MainActor
    private func showOpenPanel() {
        if let openPanel {
            activateApplication()
            openPanel.makeKeyAndOrderFront(nil)
            return
        }

        let panel = NSOpenPanel()
        panel.title = "Open Canvas"
        panel.message = "Choose a .canvas file."
        panel.canChooseFiles = true
        panel.canChooseDirectories = false
        panel.allowsMultipleSelection = true
        if let canvasType = UTType(filenameExtension: "canvas") {
            panel.allowedContentTypes = [canvasType]
        }
        panel.isReleasedWhenClosed = false
        panel.animationBehavior = .none

        openPanel = panel
        activateApplication()
        panel.begin { [weak self, weak panel] response in
            DispatchQueue.main.async { [weak self, weak panel] in
                guard let self, let panel else {
                    return
                }
                let urls = panel.urls
                self.openPanel = nil

                guard response == .OK else {
                    self.terminateIfIdle()
                    return
                }

                self.didReceiveDocumentOpenEvent = true
                for url in urls {
                    self.openDocument(at: url)
                }
                self.terminateIfIdle()
            }
        }
    }

    @MainActor
    private func openDocument(at url: URL) {
        let controller = DocumentWindowController(documentURL: url)
        let identifier = ObjectIdentifier(controller)
        documentControllers[identifier] = controller
        controller.onClose = { [weak self, weak controller] in
            guard let controller else {
                return
            }
            self?.documentControllers.removeValue(forKey: ObjectIdentifier(controller))
            self?.terminateIfIdle()
        }
        controller.showAndStart()
    }

    @MainActor
    private func configureMainMenu() {
        let mainMenu = NSMenu()
        NSApp.mainMenu = mainMenu

        let appMenuItem = NSMenuItem()
        mainMenu.addItem(appMenuItem)

        let appMenu = NSMenu()
        appMenuItem.submenu = appMenu
        appMenu.addItem(
            withTitle: "Quit Canvas",
            action: #selector(NSApplication.terminate(_:)),
            keyEquivalent: "q"
        )

        let fileMenuItem = NSMenuItem()
        mainMenu.addItem(fileMenuItem)

        let fileMenu = NSMenu(title: "File")
        fileMenuItem.submenu = fileMenu
        fileMenu.addItem(
            withTitle: "New Canvas",
            action: #selector(newCanvasFromMenu(_:)),
            keyEquivalent: "n"
        )
        fileMenu.addItem(
            withTitle: "Open...",
            action: #selector(openDocumentFromMenu(_:)),
            keyEquivalent: "o"
        )

        let editMenuItem = NSMenuItem()
        mainMenu.addItem(editMenuItem)

        let editMenu = NSMenu(title: "Edit")
        editMenuItem.submenu = editMenu
        editMenu.addItem(withTitle: "Undo", action: Selector(("undo:")), keyEquivalent: "z")
        editMenu.addItem(NSMenuItem.separator())
        editMenu.addItem(withTitle: "Cut", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        editMenu.addItem(withTitle: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        editMenu.addItem(withTitle: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        editMenu.addItem(withTitle: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")

        let viewMenuItem = NSMenuItem()
        mainMenu.addItem(viewMenuItem)

        let viewMenu = NSMenu(title: "View")
        viewMenuItem.submenu = viewMenu

        let windowMenuItem = NSMenuItem()
        mainMenu.addItem(windowMenuItem)

        let windowMenu = NSMenu(title: "Window")
        windowMenuItem.submenu = windowMenu
        windowMenu.addItem(
            withTitle: "Minimize",
            action: #selector(NSWindow.miniaturize(_:)),
            keyEquivalent: "m"
        )
        NSApp.windowsMenu = windowMenu

        let helpMenuItem = NSMenuItem()
        mainMenu.addItem(helpMenuItem)

        let helpMenu = NSMenu(title: "Help")
        helpMenuItem.submenu = helpMenu
        NSApp.helpMenu = helpMenu
    }

    @MainActor
    private func activateApplication() {
        NSRunningApplication.current.activate(options: [.activateAllWindows])
        NSApp.activate()
    }

    @MainActor
    private func terminateIfIdle() {
        guard openPanel == nil, documentControllers.isEmpty else {
            return
        }

        DispatchQueue.main.async { [weak self] in
            guard let self, self.openPanel == nil, self.documentControllers.isEmpty else {
                return
            }
            NSApp.terminate(nil)
        }
    }
}
