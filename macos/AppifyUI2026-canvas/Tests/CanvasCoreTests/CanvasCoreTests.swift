import XCTest
@testable import CanvasCore

final class CanvasCoreTests: XCTestCase {
    func testValidatesCanvasDocumentExtension() throws {
        let documentURL = URL(fileURLWithPath: "/tmp/Hello.canvas")
        XCTAssertEqual(try CanvasDocument.validate(documentURL).path, "/tmp/Hello.canvas")

        let uppercaseDocumentURL = URL(fileURLWithPath: "/tmp/Hello.CANVAS")
        XCTAssertEqual(try CanvasDocument.validate(uppercaseDocumentURL).path, "/tmp/Hello.CANVAS")

        XCTAssertThrowsError(try CanvasDocument.validate(URL(fileURLWithPath: "/tmp/Hello.txt")))
    }

    func testBuildsLocalPadRunnerArgumentsWhenCheckoutIsFound() throws {
        let existingPaths: Set<String> = [
            "/repo/package.json",
            "/repo/pad.shebang.tsx",
        ]
        let locator = PadCheckoutLocator(fileExists: { existingPaths.contains($0) })

        let command = try RunnerCommandBuilder.command(
            bunURL: URL(fileURLWithPath: "/opt/homebrew/bin/bun"),
            documentURL: URL(fileURLWithPath: "/tmp/Hello.canvas"),
            searchStartURL: URL(fileURLWithPath: "/repo/macos/AppifyUI2026-canvas/dist/Canvas.app"),
            locator: locator
        )

        XCTAssertTrue(command.usesLocalCheckout)
        XCTAssertEqual(command.executableURL.path, "/opt/homebrew/bin/bun")
        XCTAssertEqual(command.arguments, [
            "/repo/pad.shebang.tsx",
            "/tmp/Hello.canvas",
        ])
        XCTAssertEqual(command.currentDirectoryURL.path, "/repo")
    }

    func testFallsBackToPinnedRemotePackageOutsideCheckout() throws {
        let locator = PadCheckoutLocator(fileExists: { _ in false })

        let command = try RunnerCommandBuilder.command(
            bunURL: URL(fileURLWithPath: "/usr/local/bin/bun"),
            documentURL: URL(fileURLWithPath: "/tmp/Hello.canvas"),
            searchStartURL: URL(fileURLWithPath: "/Applications/Canvas.app"),
            locator: locator
        )

        XCTAssertFalse(command.usesLocalCheckout)
        XCTAssertEqual(command.executableURL.path, "/usr/local/bin/bun")
        XCTAssertEqual(command.arguments, [
            "x",
            "--bun",
            "--package",
            RunnerCommandBuilder.pinnedRemotePackage,
            "pad",
            "/tmp/Hello.canvas",
        ])
        XCTAssertEqual(command.currentDirectoryURL.path, "/tmp")
    }

    func testRejectsNonCanvasRunnerDocuments() throws {
        XCTAssertThrowsError(try RunnerCommandBuilder.command(
            bunURL: URL(fileURLWithPath: "/usr/local/bin/bun"),
            documentURL: URL(fileURLWithPath: "/tmp/Hello.txt"),
            searchStartURL: URL(fileURLWithPath: "/Applications/Canvas.app"),
            locator: PadCheckoutLocator(fileExists: { _ in false })
        ))
    }

    func testRunnerEnvironmentSetsPadNoOpen() throws {
        let environment = try CanvasRunnerEnvironment.environment(
            base: ["PATH": "/bin", "PAD_NO_OPEN": "0"],
            documentURL: URL(fileURLWithPath: "/tmp/Hello.canvas")
        )

        XCTAssertEqual(environment["PAD_NO_OPEN"], "1")
        XCTAssertEqual(environment["CANVAS_DOCUMENT"], "/tmp/Hello.canvas")
        XCTAssertEqual(environment["CANVAS_DOCUMENT_KIND"], "com.subtlegradient.pad.canvas")
        XCTAssertEqual(environment["PATH"], "/bin")
    }

    func testBunResolverUsesEnvironmentThenCommonPathsThenPath() throws {
        let environmentResolver = BunResolver(
            environment: ["CANVAS_BUN": "/custom/bun"],
            homeDirectory: URL(fileURLWithPath: "/Users/test"),
            isExecutableFile: { $0 == "/custom/bun" }
        )
        XCTAssertEqual(try environmentResolver.resolve().path, "/custom/bun")

        let commonPathResolver = BunResolver(
            environment: [:],
            homeDirectory: URL(fileURLWithPath: "/Users/test"),
            isExecutableFile: { $0 == "/Users/test/.bun/bin/bun" }
        )
        XCTAssertEqual(try commonPathResolver.resolve().path, "/Users/test/.bun/bin/bun")

        let pathResolver = BunResolver(
            environment: ["PATH": "/bin:/toolchain/bin"],
            homeDirectory: URL(fileURLWithPath: "/Users/test"),
            isExecutableFile: { $0 == "/toolchain/bin/bun" }
        )
        XCTAssertEqual(try pathResolver.resolve().path, "/toolchain/bin/bun")
    }

    func testExtractsAndValidatesPadRunnerURL() throws {
        let extracted = try XCTUnwrap(CanvasOpenURL.extract(
            from: "Hello.canvas: http://127.0.0.1:53572/?t=caf701ffe98c4227b8b7175b9f130e8f"
        ))

        XCTAssertEqual(extracted.absoluteString, "http://127.0.0.1:53572/?t=caf701ffe98c4227b8b7175b9f130e8f")
        XCTAssertEqual(try CanvasOpenURL.validate(extracted), extracted)
        XCTAssertEqual(try CanvasOpenURL.validate(URL(string: "https://localhost:4321/?t=abc")!).host(percentEncoded: false), "localhost")
    }

    func testExtractsExplicitCanvasOpenURLPrefix() throws {
        let extracted = try XCTUnwrap(CanvasOpenURL.extract(from: "CANVAS_OPEN_URL=http://[::1]:8787/?t=abc"))
        XCTAssertEqual(extracted.absoluteString, "http://[::1]:8787/?t=abc")
    }

    func testRejectsUnsafeRunnerOpenURLs() throws {
        let rejected = [
            URL(string: "https://example.com")!,
            URL(string: "http://192.168.1.5:8000")!,
            URL(fileURLWithPath: "/tmp/Hello.canvas"),
            URL(string: "pad://open")!,
        ]

        for url in rejected {
            XCTAssertThrowsError(try CanvasOpenURL.validate(url), url.absoluteString)
        }
    }
}
