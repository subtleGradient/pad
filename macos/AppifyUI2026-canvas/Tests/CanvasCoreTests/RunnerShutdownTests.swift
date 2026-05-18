import XCTest

final class RunnerShutdownTests: XCTestCase {
    func testRunnerShutdownDoesNotResetLaunchedProcessStreams() throws {
        let source = try loadDocumentWindowControllerSource()

        for functionName in ["stopRunner", "handleRunnerTermination"] {
            let body = try loadFunctionBody(named: functionName, in: source)

            XCTAssertFalse(
                body.contains("standardOutput = nil"),
                "Expected \(functionName) to leave Process.standardOutput assigned after launch; resetting it can raise an Objective-C exception during window close. Clear Pipe readability handlers instead."
            )
            XCTAssertFalse(
                body.contains("standardError = nil"),
                "Expected \(functionName) to leave Process.standardError assigned after launch; resetting it can raise an Objective-C exception during window close. Clear Pipe readability handlers instead."
            )
            XCTAssertTrue(
                body.contains("clearProcessPipes(process)"),
                "Expected \(functionName) to clear Pipe readability handlers without mutating launched Process stream properties."
            )
        }
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

    private func loadFunctionBody(named functionName: String, in source: String) throws -> String {
        guard let signatureRange = source.range(of: "func \(functionName)") else {
            XCTFail("Expected DocumentWindowController.swift to declare func \(functionName)")
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
