import XCTest

final class MacOSMenuTests: XCTestCase {
    func testMainMenuDeclaresStandardTopLevelMenusFromMacOSOKCanvas() throws {
        let appDelegateSource = try loadAppDelegateSource()

        for menuTitle in ["File", "Edit", "View", "Window", "Help"] {
            XCTAssertTrue(
                appDelegateSource.contains("NSMenu(title: \"\(menuTitle)\")"),
                "Expected AppDelegate.configureMainMenu() to declare a top-level \(menuTitle) menu from .ok/macos.ok.canvas#standard-top-level-menus."
            )
        }
    }

    func testFileMenuContainsNewCanvasBoundToCommandN() throws {
        let appDelegateSource = try loadAppDelegateSource()

        XCTAssertTrue(
            appDelegateSource.contains("withTitle: \"New Canvas\""),
            "Expected File menu to contain New Canvas from .ok/macos.ok.canvas#file-menu-new-canvas."
        )
        XCTAssertTrue(
            appDelegateSource.contains("keyEquivalent: \"n\""),
            "Expected New Canvas to use the standard Command-N shortcut from .ok/macos.ok.canvas#new-canvas-command-n."
        )
    }

    func testStandardNativeShortcutsArePreserved() throws {
        let appDelegateSource = try loadAppDelegateSource()

        let expectedStandardItems = [
            ("Edit", "Undo", "z"),
            ("Edit", "Cut", "x"),
            ("Edit", "Copy", "c"),
            ("Edit", "Paste", "v"),
            ("Edit", "Select All", "a"),
            ("Window", "Minimize", "m"),
        ]

        for (menuTitle, itemTitle, keyEquivalent) in expectedStandardItems {
            XCTAssertTrue(
                appDelegateSource.contains("withTitle: \"\(itemTitle)\"") && appDelegateSource.contains("keyEquivalent: \"\(keyEquivalent)\""),
                "Expected the \(menuTitle) menu to preserve native shortcut \(itemTitle) (Command-\(keyEquivalent.uppercased())) from .ok/macos.ok.canvas#standard-shortcuts-preserved."
            )
        }
    }

    private func loadAppDelegateSource(
        file: StaticString = #filePath,
        line: UInt = #line
    ) throws -> String {
        let packageRoot = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
        let sourceURL = packageRoot.appendingPathComponent("Sources/Canvas/AppDelegate.swift")

        guard FileManager.default.fileExists(atPath: sourceURL.path) else {
            XCTFail("Expected AppDelegate.swift at \(sourceURL.path)", file: file, line: line)
            return ""
        }

        return try String(contentsOf: sourceURL, encoding: .utf8)
    }
}
