// swift-tools-version: 6.1
import PackageDescription

let package = Package(
    name: "AppifyUI2026Canvas",
    platforms: [
        .macOS(.v14)
    ],
    products: [
        .library(name: "CanvasCore", targets: ["CanvasCore"]),
        .executable(name: "Canvas", targets: ["Canvas"]),
    ],
    targets: [
        .target(
            name: "CanvasCore",
            swiftSettings: [
                .swiftLanguageMode(.v6)
            ]
        ),
        .executableTarget(
            name: "Canvas",
            dependencies: ["CanvasCore"],
            swiftSettings: [
                .swiftLanguageMode(.v5)
            ]
        ),
        .testTarget(
            name: "CanvasCoreTests",
            dependencies: ["CanvasCore"],
            swiftSettings: [
                .swiftLanguageMode(.v6)
            ]
        ),
    ]
)
