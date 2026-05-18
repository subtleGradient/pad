#!/usr/bin/env swift
import AppKit
import CoreServices
import Foundation
import UniformTypeIdentifiers

enum RegisterDefaultError: Error, CustomStringConvertible {
    case usage
    case missingApp(URL)
    case launchServicesRegistrationFailed(OSStatus)
    case defaultHandlerTimedOut
    case defaultHandlerFailed(String)
    case defaultHandlerMismatch(expected: URL, actual: URL?)

    var description: String {
        switch self {
        case .usage:
            "Usage: register-default.swift /absolute/path/to/Canvas.app"
        case .missingApp(let appURL):
            "Missing Canvas executable in \(appURL.path)"
        case .launchServicesRegistrationFailed(let status):
            "Launch Services registration failed with OSStatus \(status)."
        case .defaultHandlerTimedOut:
            "Timed out while asking macOS to make Canvas the default .canvas app."
        case .defaultHandlerFailed(let message):
            "macOS rejected the default-handler request: \(message)"
        case .defaultHandlerMismatch(let expected, let actual):
            "Default handler mismatch. Expected \(expected.path), got \(actual?.path ?? "nil")."
        }
    }
}

func canonical(_ url: URL) -> URL {
    url.standardizedFileURL.resolvingSymlinksInPath()
}

func waitForDefaultHandler(appURL: URL, contentType: UTType) throws {
    var completed = false
    var defaultHandlerError: Error?

    NSWorkspace.shared.setDefaultApplication(at: appURL, toOpen: contentType) { error in
        defaultHandlerError = error
        completed = true
    }

    let deadline = Date().addingTimeInterval(30)
    while !completed && Date() < deadline {
        RunLoop.current.run(until: Date().addingTimeInterval(0.1))
    }

    guard completed else {
        throw RegisterDefaultError.defaultHandlerTimedOut
    }

    if let defaultHandlerError {
        throw RegisterDefaultError.defaultHandlerFailed(defaultHandlerError.localizedDescription)
    }
}

func run() throws {
    guard CommandLine.arguments.count == 2 else {
        throw RegisterDefaultError.usage
    }

    let appURL = canonical(URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true))
    let executableURL = appURL.appendingPathComponent("Contents/MacOS/Canvas", isDirectory: false)
    guard FileManager.default.isExecutableFile(atPath: executableURL.path) else {
        throw RegisterDefaultError.missingApp(appURL)
    }

    let status = LSRegisterURL(appURL as CFURL, true)
    guard status == noErr else {
        throw RegisterDefaultError.launchServicesRegistrationFailed(status)
    }

    let contentType = UTType("com.subtlegradient.pad.canvas")!
    try waitForDefaultHandler(appURL: appURL, contentType: contentType)

    let actualURL = NSWorkspace.shared.urlForApplication(toOpen: contentType).map(canonical)
    guard actualURL == appURL else {
        throw RegisterDefaultError.defaultHandlerMismatch(expected: appURL, actual: actualURL)
    }

    if let extensionType = UTType(filenameExtension: "canvas"),
       extensionType.identifier != contentType.identifier {
        print("Warning: .canvas currently resolves to \(extensionType.identifier), but \(contentType.identifier) is registered as the default handler type.")
    }

    print("Canvas is now the default app for .canvas files:")
    print(appURL.path)
}

do {
    try run()
} catch {
    fputs("\(error)\n", stderr)
    exit(1)
}
