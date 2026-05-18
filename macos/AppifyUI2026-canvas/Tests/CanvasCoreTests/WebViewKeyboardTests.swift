import XCTest

final class WebViewKeyboardTests: XCTestCase {
    func testDocumentWindowUsesKeyboardQuietingWebViewSeamForTldrawHandledKeys() throws {
        let documentWindowControllerSource = try loadDocumentWindowControllerSource()

        XCTAssertTrue(
            documentWindowControllerSource.contains("class CanvasKeyboardQuietingWebView")
                || documentWindowControllerSource.contains("final class CanvasKeyboardQuietingWebView"),
            "Expected a testable CanvasKeyboardQuietingWebView seam so tldraw-handled keys such as held Spacebar are accepted by the WebView instead of falling through to macOS invalid-input beeps. See .ok/macos.ok.canvas#webview-keyboard-events-supported and #hold-spacebar-no-error-sounds."
        )
        XCTAssertTrue(
            documentWindowControllerSource.contains("func performKeyEquivalent")
                || documentWindowControllerSource.contains("override func keyDown"),
            "Expected the WebView keyboard quieting seam to expose an overridable keyboard handling path for tldraw-handled keys."
        )
        XCTAssertFalse(
            documentWindowControllerSource.contains("let webView = WKWebView("),
            "Expected DocumentWindowController.loadWebView(url:) to instantiate the keyboard-quieting WebView seam, not a plain WKWebView that can emit macOS error sounds for held Spacebar."
        )
    }

    private func loadDocumentWindowControllerSource(
        file: StaticString = #filePath,
        line: UInt = #line
    ) throws -> String {
        let packageRoot = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
        let sourceURL = packageRoot.appendingPathComponent("Sources/Canvas/DocumentWindowController.swift")

        guard FileManager.default.fileExists(atPath: sourceURL.path) else {
            XCTFail("Expected DocumentWindowController.swift at \(sourceURL.path)", file: file, line: line)
            return ""
        }

        return try String(contentsOf: sourceURL, encoding: .utf8)
    }
}
