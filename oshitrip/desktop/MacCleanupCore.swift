import Foundation

enum CleanupFiles {
    static let fm = FileManager.default
    static func fail(_ message: String) -> NSError {
        NSError(domain: "OshiTrip", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
    }
    static func attributes(_ url: URL) throws -> [FileAttributeKey: Any]? {
        do { return try fm.attributesOfItem(atPath: url.path) }
        catch let error as NSError {
            if error.domain == NSCocoaErrorDomain && (error.code == NSFileNoSuchFileError || error.code == NSFileReadNoSuchFileError) { return nil }
            throw error
        }
    }
    static func check(_ url: URL, tree: Bool = false) throws {
        var cursor = url.standardizedFileURL
        while cursor.path != "/" {
            if try attributes(cursor)?[.type] as? FileAttributeType == .typeSymbolicLink {
                throw fail("发现符号链接，请使用真实目录：\(cursor.path)")
            }
            cursor.deleteLastPathComponent()
        }
        if tree, try attributes(url)?[.type] as? FileAttributeType == .typeDirectory {
            for child in try fm.contentsOfDirectory(at: url, includingPropertiesForKeys: nil) { try check(child, tree: true) }
        }
    }
    static func cacheTargets(_ root: URL, forget: Bool) throws -> [URL] {
        guard root.lastPathComponent == "OshiTrip" else { throw fail("无效的数据目录。") }
        try check(root)
        let names = forget ? ["data", "launcher.log", "port.txt"] : ["data", "launcher.log"]
        var targets: [URL] = []
        for name in names {
            let target = root.appendingPathComponent(name)
            try check(target, tree: true)
            if let attrs = try attributes(target) {
                let expected: FileAttributeType = name == "data" ? .typeDirectory : .typeRegular
                guard attrs[.type] as? FileAttributeType == expected else { throw fail("缓存文件类型异常：\(target.path)") }
                targets.append(target)
            }
        }
        return targets
    }
    static func clearCache(_ root: URL, forget: Bool) throws {
        let targets = try cacheTargets(root, forget: forget)
        for target in targets { try check(target, tree: true); try fm.removeItem(at: target) }
    }
    static func validatePackage(_ root: URL) throws {
        try check(root)
        guard root.pathExtension == "app" else { throw fail("请选择 OshiTrip.app。") }
        let plist = root.appendingPathComponent("Contents/Info.plist")
        try check(plist)
        guard let info = try PropertyListSerialization.propertyList(from: Data(contentsOf: plist), format: nil) as? [String: Any],
              info["CFBundleIdentifier"] as? String == "com.oshitrip.desktop",
              info["CFBundleExecutable"] as? String == "OshiTrip" else { throw fail("所选应用不是 OshiTrip 桌面版。") }
        for name in ["Contents/MacOS/OshiTrip", "Contents/Resources/runtime/node", "Contents/Resources/mac-bootstrap.mjs", "Contents/Resources/app/server.js"] {
            let file = root.appendingPathComponent(name)
            try check(file)
            guard try attributes(file)?[.type] as? FileAttributeType == .typeRegular else { throw fail("OshiTrip 应用文件不完整。") }
        }
        // The packaged pnpm node_modules legitimately contains symlinks. Trash
        // moves the bundle itself; never recursively traverse those dependencies.
    }
}
