import AppKit
import UniformTypeIdentifiers

final class AppDelegate: NSObject, NSApplicationDelegate {
    private var documentControllers: [ObjectIdentifier: DocumentWindowController] = [:]
    private var didReceiveDocumentOpenEvent = false
    private var openPanel: NSOpenPanel?
    private var openPanelWindow: NSWindow?

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
        true
    }

    @objc private func openDocumentFromMenu(_ sender: Any?) {
        DispatchQueue.main.async { [weak self] in
            self?.showOpenPanel()
        }
    }

    @MainActor
    private func showOpenPanel() {
        if let openPanelWindow {
            activateApplication()
            openPanelWindow.makeKeyAndOrderFront(nil)
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

        let ownerWindow = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 520, height: 180),
            styleMask: [.titled, .closable, .miniaturizable],
            backing: .buffered,
            defer: false
        )
        ownerWindow.title = "Open Canvas"
        ownerWindow.contentView = openPanelContentView()
        ownerWindow.center()

        openPanel = panel
        openPanelWindow = ownerWindow
        activateApplication()
        ownerWindow.makeKeyAndOrderFront(nil)
        panel.beginSheetModal(for: ownerWindow) { [weak self, weak panel, weak ownerWindow] response in
            DispatchQueue.main.async { [weak self, weak panel, weak ownerWindow] in
                guard let self, let panel, let ownerWindow else {
                    return
                }
                self.openPanel = nil
                self.openPanelWindow = nil

                guard response == .OK else {
                    ownerWindow.close()
                    return
                }

                self.didReceiveDocumentOpenEvent = true
                for url in panel.urls {
                    self.openDocument(at: url)
                }
                ownerWindow.close()
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
            withTitle: "Open...",
            action: #selector(openDocumentFromMenu(_:)),
            keyEquivalent: "o"
        )
    }

    @MainActor
    private func activateApplication() {
        NSRunningApplication.current.activate(options: [.activateAllWindows])
        NSApp.activate()
    }

    @MainActor
    private func openPanelContentView() -> NSView {
        let container = NSView()
        container.translatesAutoresizingMaskIntoConstraints = false

        let titleLabel = NSTextField(labelWithString: "Open Canvas")
        titleLabel.font = NSFont.systemFont(ofSize: 24, weight: .semibold)
        titleLabel.translatesAutoresizingMaskIntoConstraints = false

        let messageLabel = NSTextField(labelWithString: "Choose a .canvas file to edit with PAD.")
        messageLabel.font = NSFont.systemFont(ofSize: 14)
        messageLabel.textColor = NSColor.secondaryLabelColor
        messageLabel.translatesAutoresizingMaskIntoConstraints = false

        let stack = NSStackView(views: [titleLabel, messageLabel])
        stack.orientation = .vertical
        stack.alignment = .leading
        stack.spacing = 8
        stack.translatesAutoresizingMaskIntoConstraints = false

        container.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: container.leadingAnchor, constant: 28),
            stack.trailingAnchor.constraint(lessThanOrEqualTo: container.trailingAnchor, constant: -28),
            stack.centerYAnchor.constraint(equalTo: container.centerYAnchor),
        ])

        return container
    }
}
