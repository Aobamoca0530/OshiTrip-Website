import Cocoa

final class Cleaner: NSObject, NSApplicationDelegate {
    let data = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("OshiTrip")
    var window: NSWindow!
    var folder: NSTextField!
    var status: NSTextField!
    var forget: NSButton!
    var selected: URL?
    func applicationDidFinishLaunching(_ notification: Notification) {
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 680, height: 420), styleMask: [.titled, .closable, .miniaturizable], backing: .buffered, defer: false)
        window.title = "OshiTrip · 卸载与缓存清理"; window.center()
        let description = NSTextField(wrappingLabelWithString: "仅清理缓存：删除下载的活动资料和启动日志，下次启动会重新生成。\n卸载并清理：另外将所选 OshiTrip.app 移入废纸篓。\n请先退出所有 OshiTrip 启动器并关闭网页。收藏、行程及浏览器缓存需在浏览器中清除。")
        description.frame = NSRect(x: 24, y: 302, width: 632, height: 94)
        window.contentView!.addSubview(description)
        folder = NSTextField(labelWithString: "仅清理缓存无需选择程序")
        folder.frame = NSRect(x: 24, y: 264, width: 478, height: 24)
        folder.lineBreakMode = .byTruncatingMiddle
        window.contentView!.addSubview(folder)
        button("选择程序", x: 516, y: 258, width: 140, action: #selector(choose))
        forget = NSButton(checkboxWithTitle: "同时重置访问地址（重新安装后可能需要原地址才能找回收藏）", target: nil, action: nil)
        forget.frame = NSRect(x: 24, y: 211, width: 632, height: 28)
        window.contentView!.addSubview(forget)
        button("仅清理缓存", x: 24, y: 157, width: 150, action: #selector(clean))
        button("卸载并清理", x: 190, y: 157, width: 150, action: #selector(uninstall))
        button("浏览器数据说明", x: 356, y: 157, width: 164, action: #selector(browserHelp))
        status = NSTextField(wrappingLabelWithString: "数据目录：\(data.path)\n卸载只处理所选的一个副本。")
        status.frame = NSRect(x: 24, y: 18, width: 632, height: 120)
        window.contentView!.addSubview(status)
        window.makeKeyAndOrderFront(nil); NSApp.activate(ignoringOtherApps: true)
    }
    func button(_ title: String, x: CGFloat, y: CGFloat, width: CGFloat, action: Selector) {
        let b = NSButton(title: title, target: self, action: action)
        b.frame = NSRect(x: x, y: y, width: width, height: 36); window.contentView!.addSubview(b)
    }
    @objc func choose() {
        let dialog = NSOpenPanel(); dialog.canChooseFiles = true; dialog.canChooseDirectories = false
        dialog.allowsMultipleSelection = false; dialog.treatsFilePackagesAsDirectories = false
        dialog.message = "选择要卸载的 OshiTrip.app（应用程序文件夹或其他位置均可）"
        if dialog.runModal() == .OK { selected = dialog.url; folder.stringValue = selected!.path }
    }
    func address() -> String {
        let portFile = data.appendingPathComponent("port.txt")
        if (try? CleanupFiles.check(portFile)) != nil,
           let text = try? String(contentsOf: portFile, encoding: .utf8),
           let port = Int(text.trimmingCharacters(in: .whitespacesAndNewlines)), (1024...65535).contains(port) {
            return "原访问地址：http://127.0.0.1:\(port)/"
        }
        return "默认地址：http://127.0.0.1:43187/（历史地址请查看浏览器记录）"
    }
    func alert(_ text: String) {
        let dialog = NSAlert(); dialog.messageText = "OshiTrip"; dialog.informativeText = text; dialog.runModal()
    }
    @objc func browserHelp() {
        alert("在原来使用 OshiTrip 的每个浏览器用户配置中，通过网站设置清除原访问地址的网站数据。Safari 可在设置 → 隐私 → 管理网站数据中查看。\n浏览器可能按主机列出 127.0.0.1；删除前核对范围，避免影响该主机上其他本地应用。\n这会删除相应的收藏、关注、行程和浏览器缓存，无法撤销，请先自行备份重要安排。不要清空整个浏览器。\n\n" + address())
    }
    func checkStopped() throws {
        guard NSRunningApplication.runningApplications(withBundleIdentifier: "com.oshitrip.desktop").isEmpty else {
            throw CleanupFiles.fail("请先退出所有 OshiTrip 启动器，再重试。")
        }
    }
    @objc func clean() { run(uninstall: false) }
    @objc func uninstall() { run(uninstall: true) }
    func run(uninstall: Bool) {
        var removed = false
        do {
            try checkStopped()
            let gate = try DesktopLock(directory: data)
            defer { withExtendedLifetime(gate) {} }
            do {
                if uninstall {
                    guard let target = selected else { throw CleanupFiles.fail("请先选择 OshiTrip.app。") }
                    try CleanupFiles.validatePackage(target)
                }
                let targets = try CleanupFiles.cacheTargets(data, forget: forget.state == .on)
                let origin = address()
                let dialog = NSAlert(); dialog.alertStyle = .warning; dialog.messageText = "确认清理范围"
                let programSummary = uninstall ? "移入废纸篓（包括其中所有文件）：\n\(selected!.path)" : ""
                let cacheSummary = targets.isEmpty ? "没有可清理的缓存。" : targets.map { $0.path }.joined(separator: "\n")
                let addressSummary = forget.state == .on ? "访问地址将重置，请记下原地址。" : "保留访问地址。"
                dialog.informativeText = [programSummary, "永久删除：", cacheSummary, origin, addressSummary, "浏览器数据仍需手动清除。"].filter { !$0.isEmpty }.joined(separator: "\n\n")
                dialog.addButton(withTitle: "取消"); dialog.addButton(withTitle: "确认清理")
                guard dialog.runModal() == .alertSecondButtonReturn else { return }
                try checkStopped()
                if uninstall {
                    try CleanupFiles.validatePackage(selected!)
                    try FileManager.default.trashItem(at: selected!, resultingItemURL: nil)
                    removed = true
                }
                try CleanupFiles.clearCache(data, forget: forget.state == .on)
                status.stringValue = (removed ? "程序已移入废纸篓，活动缓存与日志已清理。" : "活动缓存与日志已清理。") + "\n" + origin + "\n浏览器数据仍保留；需要删除时请点击“浏览器数据说明”。"
            }
        } catch {
            status.stringValue = (removed ? "程序已移入废纸篓，但缓存清理未全部完成。" : "操作未完成；部分缓存可能已清理。") + "\n" + error.localizedDescription
            alert(status.stringValue)
        }
    }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
}

@main
enum CleanupMain {
    static func main() {
        let app = NSApplication.shared
        let delegate = Cleaner(); app.delegate = delegate
        app.setActivationPolicy(.regular); app.run()
    }
}
