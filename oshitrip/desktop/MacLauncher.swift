import Cocoa

final class Launcher: NSObject, NSApplicationDelegate {
    var window: NSWindow!
    var label: NSTextField!
    var child: Process?
    var input: Pipe?
    var output: FileHandle?
    var maintenanceLock: DesktopLock?
    var url = URL(string: "http://127.0.0.1:43187/")!
    func applicationDidFinishLaunching(_ notification: Notification) {
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 520, height: 220), styleMask: [.titled, .closable, .miniaturizable], backing: .buffered, defer: false)
        window.title = "OshiTrip · 本地启动器"
        window.center()
        label = NSTextField(wrappingLabelWithString: "正在启动 OshiTrip…")
        label.frame = NSRect(x: 24, y: 100, width: 472, height: 90)
        label.font = NSFont.systemFont(ofSize: 16)
        window.contentView!.addSubview(label)
        let open = NSButton(title: "打开网站", target: self, action: #selector(openBrowser))
        open.frame = NSRect(x: 24, y: 45, width: 140, height: 32)
        window.contentView!.addSubview(open)
        let quit = NSButton(title: "停止并退出", target: self, action: #selector(stop))
        quit.frame = NSRect(x: 180, y: 45, width: 140, height: 32)
        window.contentView!.addSubview(quit)
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        start()
    }
    func start() {
        do {
            let resources = Bundle.main.resourceURL!
            let data = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("OshiTrip")
            maintenanceLock = try DesktopLock(directory: data)
            try FileManager.default.createDirectory(at: data, withIntermediateDirectories: true)
            let log = data.appendingPathComponent("launcher.log")
            if let size = try? FileManager.default.attributesOfItem(atPath: log.path)[.size] as? NSNumber, size.intValue > 1048576 { try Data().write(to: log) }
            if !FileManager.default.fileExists(atPath: log.path) { FileManager.default.createFile(atPath: log.path, contents: nil) }
            output = try FileHandle(forWritingTo: log); output?.seekToEndOfFile()
            let process = Process()
            process.executableURL = resources.appendingPathComponent("runtime/node")
            process.arguments = [resources.appendingPathComponent("mac-bootstrap.mjs").path]
            process.currentDirectoryURL = resources
            // Use a small explicit environment; never inherit preload flags or credentials.
            process.environment = ["HOME": NSHomeDirectory(), "PATH": "/usr/bin:/bin", "NODE_ENV": "production", "NEXT_TELEMETRY_DISABLED": "1", "OSHITRIP_SHARED_DATA": "1", "OSHITRIP_DATA_DIR": data.appendingPathComponent("data").path, "OSHITRIP_LAUNCHER_DIR": data.path]
            input = Pipe(); process.standardInput = input
            let messages = Pipe(); process.standardOutput = messages; process.standardError = output
            var buffer = Data()
            messages.fileHandleForReading.readabilityHandler = { [weak self] handle in
                let bytes = handle.availableData
                if bytes.isEmpty { handle.readabilityHandler = nil; return }
                buffer.append(bytes)
                while let range = buffer.range(of: Data([10])) {
                    let line = String(data: buffer[..<range.lowerBound], encoding: .utf8) ?? ""
                    buffer.removeSubrange(..<range.upperBound)
                    if line.hasPrefix("OSHITRIP_READY "), let address = URL(string: String(line.dropFirst(15))) {
                        DispatchQueue.main.async { self?.url = address; self?.label.stringValue = "已启动：\(address.absoluteString)\n关闭此窗口会停止服务。收藏和行程保存在浏览器中。"; self?.openBrowser() }
                    } else if let encoded = (line + "\n").data(using: .utf8) { self?.output?.write(encoded) }
                }
            }
            process.terminationHandler = { [weak self] _ in DispatchQueue.main.async { self?.label.stringValue = "服务已停止。若启动失败，请查看 ~/Library/Application Support/OshiTrip/launcher.log；端口被占用时请关闭已运行的 OshiTrip 后重试。" } }
            child = process
            try process.run()
        } catch { label.stringValue = "启动失败：\(error.localizedDescription)" }
    }
    @objc func openBrowser() { if child?.isRunning == true { NSWorkspace.shared.open(url) } }
    @objc func stop() { NSApp.terminate(nil) }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
    func applicationWillTerminate(_ notification: Notification) {
        try? input?.fileHandleForWriting.close()
        if child?.isRunning == true { child?.terminate(); child?.waitUntilExit() }
        try? output?.close()
        maintenanceLock = nil
    }
}
@main
enum LauncherMain {
    static func main() {
        let app = NSApplication.shared
        let delegate = Launcher()
        app.delegate = delegate
        app.setActivationPolicy(.regular)
        app.run()
    }
}
