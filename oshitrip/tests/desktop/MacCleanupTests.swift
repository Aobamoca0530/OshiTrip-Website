import Foundation

@main
enum CleanupTests {
    static func require(_ condition: Bool, _ message: String) throws {
        if !condition { throw CleanupFiles.fail(message) }
    }
    static func reject(_ message: String, _ operation: () throws -> Void) throws {
        do { try operation() } catch { return }
        throw CleanupFiles.fail("Expected refusal: \(message)")
    }
    static func main() throws {
        let root = URL(fileURLWithPath: CommandLine.arguments[1]).resolvingSymlinksInPath()
        let data = root.appendingPathComponent("OshiTrip")
        try CleanupFiles.clearCache(root.appendingPathComponent("never-installed/OshiTrip"), forget: true)
        try CleanupFiles.clearCache(data, forget: false)
        try require(try String(contentsOf: data.appendingPathComponent("port.txt"), encoding: .utf8) == "45000", "Keep origin")
        try require(FileManager.default.fileExists(atPath: data.appendingPathComponent("personal.txt").path), "Keep unknown files")
        try require(!FileManager.default.fileExists(atPath: data.appendingPathComponent("data").path), "Remove cache")
        try require(!FileManager.default.fileExists(atPath: data.appendingPathComponent("launcher.log").path), "Remove log")
        try CleanupFiles.clearCache(data, forget: false)
        try CleanupFiles.clearCache(data, forget: true)
        try require(!FileManager.default.fileExists(atPath: data.appendingPathComponent("port.txt").path), "Explicit reset")
        try reject("wrong root") { try CleanupFiles.clearCache(root, forget: true) }
        let linked = root.appendingPathComponent("linked/OshiTrip")
        try reject("symlink cache") { try CleanupFiles.clearCache(linked, forget: true) }
        try require(FileManager.default.fileExists(atPath: linked.appendingPathComponent("launcher.log").path), "Preflight before deletion")
        try require(try String(contentsOf: root.appendingPathComponent("outside/keep.txt"), encoding: .utf8) == "safe", "Symlink target untouched")
        try reject("symlink ancestor") { try CleanupFiles.check(linked.appendingPathComponent("data/keep.txt")) }
        let package = root.appendingPathComponent("OshiTrip.app")
        try CleanupFiles.validatePackage(package)
        try reject("unmarked folder") { try CleanupFiles.validatePackage(root) }
        let plist = package.appendingPathComponent("Contents/Info.plist")
        try Data("<plist version=\"1.0\"><dict><key>CFBundleIdentifier</key><string>com.other.app</string></dict></plist>".utf8).write(to: plist)
        try reject("wrong bundle") { try CleanupFiles.validatePackage(package) }
        let trashFixture = root.appendingPathComponent("recycle-only-this-fixture")
        try FileManager.default.createDirectory(at: trashFixture, withIntermediateDirectories: false)
        try Data("Disposable OshiTrip cleanup test fixture".utf8).write(to: trashFixture.appendingPathComponent("fixture.txt"))
        try FileManager.default.trashItem(at: trashFixture, resultingItemURL: nil)
        try require(!FileManager.default.fileExists(atPath: trashFixture.path), "Move fixture to Trash")
        let gate = try DesktopLock(directory: data)
        try withExtendedLifetime(gate) {
            try reject("concurrent cleaner/launcher") { _ = try DesktopLock(directory: data) }
        }
        print("PASS: cache removal, origin preservation/reset, idempotence, symlink/ancestor refusal, preflight, bundle validation, Trash move and process lock")
    }
}
