import Foundation

public enum CanvasCoreError: Error, Equatable, CustomStringConvertible, Sendable {
    case invalidDocumentExtension(String)
    case missingBun(String)
    case invalidOpenURL(String)

    public var description: String {
        switch self {
        case .invalidDocumentExtension(let message):
            "Invalid Canvas document: \(message)"
        case .missingBun(let message):
            "Bun was not found: \(message)"
        case .invalidOpenURL(let message):
            "Runner produced an unsafe open URL: \(message)"
        }
    }
}

public enum CanvasDocument {
    public static let filenameExtension = "canvas"
    public static let contentTypeIdentifier = "com.subtlegradient.pad.canvas"

    public static func validate(_ documentURL: URL) throws -> URL {
        let standardized = documentURL.standardizedFileURL
        guard standardized.pathExtension.lowercased() == filenameExtension else {
            throw CanvasCoreError.invalidDocumentExtension("Expected a .canvas file, got \(standardized.lastPathComponent).")
        }
        return standardized
    }
}

public struct RunnerCommand: Equatable, Sendable {
    public var executableURL: URL
    public var arguments: [String]
    public var currentDirectoryURL: URL
    public var usesLocalCheckout: Bool

    public init(
        executableURL: URL,
        arguments: [String],
        currentDirectoryURL: URL,
        usesLocalCheckout: Bool
    ) {
        self.executableURL = executableURL
        self.arguments = arguments
        self.currentDirectoryURL = currentDirectoryURL
        self.usesLocalCheckout = usesLocalCheckout
    }
}

public struct PadCheckoutLocator: Sendable {
    public var maxAncestorDepth: Int
    public var fileExists: @Sendable (String) -> Bool

    public init(
        maxAncestorDepth: Int = 12,
        fileExists: @escaping @Sendable (String) -> Bool = { FileManager.default.fileExists(atPath: $0) }
    ) {
        self.maxAncestorDepth = maxAncestorDepth
        self.fileExists = fileExists
    }

    public func locate(from searchStartURL: URL) -> URL? {
        var current = searchStartURL.standardizedFileURL

        for _ in 0...maxAncestorDepth {
            let packageJSON = current.appendingPathComponent("package.json", isDirectory: false)
            let padRunner = current.appendingPathComponent("pad.shebang.tsx", isDirectory: false)
            if fileExists(packageJSON.path) && fileExists(padRunner.path) {
                return current
            }

            let parent = current.deletingLastPathComponent()
            if parent.path == current.path {
                return nil
            }
            current = parent
        }

        return nil
    }
}

public enum RunnerCommandBuilder {
    public static let pinnedRemotePackage = "https://github.com/subtleGradient/pad/archive/03823418e3d8059a640b125717e738ed6e81e705.tar.gz"

    public static func command(
        bunURL: URL,
        documentURL: URL,
        searchStartURL: URL,
        locator: PadCheckoutLocator = PadCheckoutLocator()
    ) throws -> RunnerCommand {
        let standardizedDocumentURL = try CanvasDocument.validate(documentURL)
        let documentPath = standardizedDocumentURL.path

        if let checkoutURL = locator.locate(from: searchStartURL) {
            let runnerURL = checkoutURL.appendingPathComponent("pad.shebang.tsx", isDirectory: false)
            return RunnerCommand(
                executableURL: bunURL,
                arguments: [runnerURL.path, documentPath],
                currentDirectoryURL: checkoutURL,
                usesLocalCheckout: true
            )
        }

        return RunnerCommand(
            executableURL: bunURL,
            arguments: [
                "x",
                "--bun",
                "--package",
                pinnedRemotePackage,
                "pad",
                documentPath,
            ],
            currentDirectoryURL: standardizedDocumentURL.deletingLastPathComponent(),
            usesLocalCheckout: false
        )
    }
}

public struct BunResolver: Sendable {
    public var environment: [String: String]
    public var homeDirectory: URL
    public var isExecutableFile: @Sendable (String) -> Bool

    public init(
        environment: [String: String] = ProcessInfo.processInfo.environment,
        homeDirectory: URL = FileManager.default.homeDirectoryForCurrentUser,
        isExecutableFile: @escaping @Sendable (String) -> Bool = { FileManager.default.isExecutableFile(atPath: $0) }
    ) {
        self.environment = environment
        self.homeDirectory = homeDirectory
        self.isExecutableFile = isExecutableFile
    }

    public func resolve() throws -> URL {
        if let override = environment["CANVAS_BUN"], !override.isEmpty {
            let expanded = expandTilde(override)
            guard expanded.hasPrefix("/") else {
                throw CanvasCoreError.missingBun("CANVAS_BUN must be an absolute path.")
            }
            guard isExecutableFile(expanded) else {
                throw CanvasCoreError.missingBun("CANVAS_BUN is not executable at \(expanded).")
            }
            return URL(fileURLWithPath: expanded)
        }

        let commonPaths = [
            "/opt/homebrew/bin/bun",
            "/usr/local/bin/bun",
            homeDirectory.appendingPathComponent(".bun/bin/bun").path,
        ]
        if let path = commonPaths.first(where: isExecutableFile) {
            return URL(fileURLWithPath: path)
        }

        let pathEntries = environment["PATH", default: ""]
            .split(separator: ":", omittingEmptySubsequences: true)
            .map(String.init)
        for entry in pathEntries {
            let candidate = URL(fileURLWithPath: entry).appendingPathComponent("bun", isDirectory: false).path
            if isExecutableFile(candidate) {
                return URL(fileURLWithPath: candidate)
            }
        }

        throw CanvasCoreError.missingBun("Set CANVAS_BUN, install Bun in /opt/homebrew/bin, /usr/local/bin, ~/.bun/bin, or add bun to PATH.")
    }

    private func expandTilde(_ path: String) -> String {
        if path == "~" {
            return homeDirectory.path
        }
        if path.hasPrefix("~/") {
            return homeDirectory.appendingPathComponent(String(path.dropFirst(2))).path
        }
        return path
    }
}

public enum CanvasRunnerEnvironment {
    public static func environment(
        base: [String: String] = ProcessInfo.processInfo.environment,
        documentURL: URL
    ) throws -> [String: String] {
        let standardizedDocumentURL = try CanvasDocument.validate(documentURL)
        var environment = base
        environment["PAD_NO_OPEN"] = "1"
        environment["CANVAS_DOCUMENT"] = standardizedDocumentURL.path
        environment["CANVAS_DOCUMENT_KIND"] = CanvasDocument.contentTypeIdentifier
        return environment
    }
}

public enum CanvasOpenURL {
    public static let outputPrefix = "CANVAS_OPEN_URL="

    public static func extract(from line: String) -> URL? {
        let trimmed = line.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.hasPrefix(outputPrefix) {
            return URL(string: String(trimmed.dropFirst(outputPrefix.count)))
        }

        return firstURL(in: trimmed)
    }

    private static func firstURL(in text: String) -> URL? {
        let schemes = ["http://", "https://"]
        let ranges = schemes.compactMap { scheme in
            text.range(of: scheme, options: [.caseInsensitive])
        }
        guard let start = ranges.map(\.lowerBound).min() else {
            return nil
        }

        var end = start
        while end < text.endIndex, !text[end].isWhitespace {
            text.formIndex(after: &end)
        }

        var candidate = String(text[start..<end])
        while let last = candidate.last, "'\"),]}".contains(last) {
            candidate.removeLast()
        }

        return URL(string: candidate)
    }

    public static func validate(_ url: URL) throws -> URL {
        guard let scheme = url.scheme?.lowercased() else {
            throw CanvasCoreError.invalidOpenURL("URL has no scheme.")
        }

        guard scheme == "http" || scheme == "https" else {
            throw CanvasCoreError.invalidOpenURL("Unsupported URL scheme: \(scheme).")
        }

        guard let host = url.host(percentEncoded: false)?.lowercased(),
              ["localhost", "127.0.0.1", "::1", "0:0:0:0:0:0:0:1"].contains(host)
        else {
            throw CanvasCoreError.invalidOpenURL("HTTP(S) URLs must point at localhost or loopback.")
        }

        return url
    }
}
