import Foundation
import Darwin

// Shared by the launcher and standalone cleaner. Keep this small lock file:
// unlinking a live flock file would allow another process to lock a new inode.
final class DesktopLock {
    private var descriptor: Int32 = -1
    init(directory: URL) throws {
        var cursor = directory.standardizedFileURL
        while cursor.path != "/" {
            if let attrs = try? FileManager.default.attributesOfItem(atPath: cursor.path),
               attrs[.type] as? FileAttributeType == .typeSymbolicLink {
                throw NSError(domain: "OshiTrip", code: 1, userInfo: [NSLocalizedDescriptionKey: "数据目录包含符号链接，请使用真实目录。"])
            }
            cursor.deleteLastPathComponent()
        }
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        descriptor = open(directory.appendingPathComponent(".maintenance.lock").path, O_CREAT | O_RDWR | O_NOFOLLOW, 0o600)
        guard descriptor >= 0 else { throw NSError(domain: NSPOSIXErrorDomain, code: Int(errno)) }
        guard flock(descriptor, LOCK_EX | LOCK_NB) == 0 else {
            close(descriptor); descriptor = -1
            throw NSError(domain: "OshiTrip", code: 2, userInfo: [NSLocalizedDescriptionKey: "请先退出 OshiTrip 启动器或其他清理工具，再重试。"])
        }
    }
    deinit { if descriptor >= 0 { flock(descriptor, LOCK_UN); close(descriptor) } }
}
