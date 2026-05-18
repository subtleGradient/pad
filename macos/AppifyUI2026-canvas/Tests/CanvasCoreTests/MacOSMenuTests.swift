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

    func testNewCanvasMenuActionCreatesAndOpensCanvasFile() throws {
        let appDelegateSource = try loadAppDelegateSource()
        let actionBody = try loadFunctionBody(named: "newCanvasFromMenu", in: appDelegateSource)

        XCTAssertTrue(
            actionBody.contains(".canvas") || actionBody.contains("filenameExtension: \"canvas\""),
            "Expected Command-N's newCanvasFromMenu(_:) implementation path to create a new .canvas file from .ok/macos.ok.canvas#file-menu-new-canvas."
        )
        XCTAssertTrue(
            actionBody.contains("createFile") || actionBody.contains("write(to:") || actionBody.contains("FileHandle"),
            "Expected Command-N's newCanvasFromMenu(_:) implementation path to persist the new .canvas file before opening it."
        )
        XCTAssertTrue(
            actionBody.contains("openDocument(at:"),
            "Expected Command-N's newCanvasFromMenu(_:) implementation path to open the newly-created .canvas document window."
        )
    }

    func testFileMenuContainsNativeCloseBoundToCommandW() throws {
        let appDelegateSource = try loadAppDelegateSource()

        XCTAssertTrue(
            appDelegateSource.contains("withTitle: \"Close\""),
            "Expected File menu to contain a native Close item from .ok/macos.ok.canvas#command-w-close-window."
        )
        XCTAssertTrue(
            appDelegateSource.contains("keyEquivalent: \"w\""),
            "Expected native Close menu item to use the standard Command-W shortcut."
        )
        XCTAssertTrue(
            appDelegateSource.contains("#selector(NSWindow.performClose(_:))")
                || appDelegateSource.contains("Selector((\"performClose:\"))")
                || appDelegateSource.contains("closeCurrentWindowFromMenu"),
            "Expected Command-W to have an explicit native close action path for the current window."
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

    private func loadFunctionBody(named functionName: String, in source: String) throws -> String {
        guard let signatureRange = source.range(of: "func \(functionName)") else {
            XCTFail("Expected AppDelegate.swift to declare func \(functionName)")
            return ""
        }

        guard let openingBrace = source[signatureRange.lowerBound...].firstIndex(of: "{") else {
            XCTFail("Expected func \(functionName) to have a body")
            return ""
        }

        var depth = 0
        var currentIndex = openingBrace
        while currentIndex < source.endIndex {
            let character = source[currentIndex]
            if character == "{" {
                depth += 1
            } else if character == "}" {
                depth -= 1
                if depth == 0 {
                    return String(source[openingBrace...currentIndex])
                }
            }
            currentIndex = source.index(after: currentIndex)
        }

        XCTFail("Expected func \(functionName) body to close with a matching brace")
        return ""
    }
}
