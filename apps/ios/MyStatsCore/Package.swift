// swift-tools-version: 5.9
import PackageDescription

let package = Package(
  name: "MyStatsCore", platforms: [.iOS(.v17), .macOS(.v14)],
  products: [.library(name: "MyStatsCore", targets: ["MyStatsCore"])],
  targets: [
    .target(name: "MyStatsCore"),
    .testTarget(
      name: "MyStatsCoreTests", dependencies: ["MyStatsCore"], resources: [.copy("Fixtures")]),
  ])
