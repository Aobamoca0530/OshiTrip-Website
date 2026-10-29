using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Runtime.InteropServices;
using System.Text.RegularExpressions;
using System.Threading;
using System.Windows.Forms;

// Independent of the application, its Node runtime and its installation folder.
internal static class CleanupProgram
{
    [STAThread]
    private static void Main()
    {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Application.Run(new CleanupWindow());
    }
}

internal static class CleanupFiles
{
    internal static bool Exists(string path)
    {
        try { File.GetAttributes(path); return true; }
        catch (FileNotFoundException) { return false; }
        catch (DirectoryNotFoundException) { return false; }
    }

    // Check ancestors as well as descendants; never follow a junction outside
    // the reviewed target. Access errors fail closed instead of looking absent.
    internal static void CheckPath(string path, bool tree)
    {
        path = Path.GetFullPath(path);
        for (string current = path; current != null; current = Path.GetDirectoryName(current))
            if (Exists(current) && (File.GetAttributes(current) & FileAttributes.ReparsePoint) != 0)
                throw new IOException("发现链接或重解析点，请改用真实目录：" + current);
        if (tree && Directory.Exists(path))
            foreach (string child in Directory.GetFileSystemEntries(path)) CheckPath(child, true);
    }

    internal static List<string> CacheTargets(string root, bool forgetAddress)
    {
        root = Path.GetFullPath(root);
        if (!string.Equals(Path.GetFileName(root), "OshiTrip", StringComparison.Ordinal))
            throw new IOException("无效的 OshiTrip 数据目录。");
        CheckPath(root, false);
        var targets = new List<string>();
        foreach (var name in forgetAddress ? new[] { "data", "launcher.log", "port.txt" } : new[] { "data", "launcher.log" })
        {
            string target = Path.GetFullPath(Path.Combine(root, name));
            if (Path.GetDirectoryName(target) != root) throw new IOException("清理路径超出范围。");
            CheckPath(target, true);
            if (Exists(target))
            {
                if ((name == "data") != Directory.Exists(target)) throw new IOException("缓存文件类型异常：" + target);
                targets.Add(target);
            }
        }
        return targets;
    }

    internal static void ClearCache(string root, bool forgetAddress)
    {
        // Validate the whole plan before removing its first entry.
        var targets = CacheTargets(root, forgetAddress);
        foreach (var target in targets)
        {
            CheckPath(target, true);
            if (Directory.Exists(target)) Directory.Delete(target, true);
            else File.Delete(target);
        }
    }

    internal static string ValidatePackage(string folder, string cleanerFolder)
    {
        string root = Path.GetFullPath(folder).TrimEnd(Path.DirectorySeparatorChar);
        if (root == Path.GetPathRoot(root).TrimEnd(Path.DirectorySeparatorChar)) throw new IOException("不能卸载磁盘根目录。");
        CheckPath(root, true);
        string own = Path.GetFullPath(cleanerFolder).TrimEnd(Path.DirectorySeparatorChar);
        if (own.Equals(root, StringComparison.OrdinalIgnoreCase) || own.StartsWith(root + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase))
            throw new IOException("请先将清理工具移到 OshiTrip 程序文件夹之外，再执行卸载。");
        foreach (var name in new[] { ".oshitrip-portable", "OshiTrip.exe", "bootstrap.mjs", "app/server.js", "runtime/node.exe" })
            if (!File.Exists(Path.Combine(root, name))) throw new IOException("请选择完整解压后的 OshiTrip Windows 程序文件夹。");
        if (!Regex.IsMatch(File.ReadAllText(Path.Combine(root, ".oshitrip-portable")).Trim(), @"^\d+\.\d+\.\d+$"))
            throw new IOException("程序包标记无效。");
        var allowed = new HashSet<string>(new[] { ".oshitrip-portable", "OshiTrip.exe", "bootstrap.mjs", "app", "runtime", "THIRD-PARTY-NOTICES", "使用说明.txt", "build-info.json", "desktop.ini" }, StringComparer.OrdinalIgnoreCase);
        foreach (var entry in Directory.GetFileSystemEntries(root))
            if (!allowed.Contains(Path.GetFileName(entry))) throw new IOException("程序目录中含有额外文件，请先移出个人文件后再卸载：" + Path.GetFileName(entry));
        return root;
    }

    internal static void Recycle(string folder)
    {
        var operation = new FileOperation { function = 3, from = folder + '\0' + '\0', flags = 0x40 | 0x10 | 0x400 | 0x4000 };
        int result = SHFileOperation(ref operation);
        if (result != 0 || operation.aborted) throw new IOException("程序移入回收站失败或已取消（" + result + "）。请关闭启动器后重试。");
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct FileOperation
    {
        public IntPtr window;
        public uint function;
        [MarshalAs(UnmanagedType.LPWStr)] public string from;
        [MarshalAs(UnmanagedType.LPWStr)] public string to;
        public ushort flags;
        [MarshalAs(UnmanagedType.Bool)] public bool aborted;
        public IntPtr mappings;
        [MarshalAs(UnmanagedType.LPWStr)] public string title;
    }
    [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
    private static extern int SHFileOperation(ref FileOperation operation);
}

internal sealed class CleanupWindow : Form
{
    private readonly string data = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "OshiTrip");
    private readonly TextBox folder = new TextBox { ReadOnly = true };
    private readonly CheckBox forget = new CheckBox { Text = "同时重置访问地址（重新安装后可能需要原地址才能找回收藏）", AutoSize = true };
    private readonly Label status = new Label();

    internal CleanupWindow()
    {
        Text = "OshiTrip · 卸载与缓存清理";
        ClientSize = new Size(660, 400);
        Font = new Font("Microsoft YaHei UI", 10);
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        StartPosition = FormStartPosition.CenterScreen;
        var description = new Label { Text = "仅清理缓存：删除下载的活动资料和启动日志，下次启动会重新生成。\n卸载并清理：另外将所选程序文件夹移入回收站。\n请先关闭所有 OshiTrip 启动器和网页。收藏、行程及浏览器缓存需在浏览器中清除。", Location = new Point(22, 20), Size = new Size(615, 85) };
        folder.SetBounds(22, 116, 480, 28);
        var choose = new Button { Text = "选择程序目录", Location = new Point(512, 113), Size = new Size(125, 32) };
        choose.Click += delegate {
            using (var dialog = new FolderBrowserDialog { Description = "选择含 OshiTrip.exe 的完整程序目录", ShowNewFolderButton = false })
                if (dialog.ShowDialog(this) == DialogResult.OK) folder.Text = dialog.SelectedPath;
        };
        forget.Location = new Point(22, 164);
        var clean = new Button { Text = "仅清理缓存", Location = new Point(22, 206), Size = new Size(145, 38) };
        var uninstall = new Button { Text = "卸载并清理", Location = new Point(183, 206), Size = new Size(145, 38) };
        var help = new Button { Text = "浏览器数据说明", Location = new Point(344, 206), Size = new Size(155, 38) };
        clean.Click += delegate { Run(false); };
        uninstall.Click += delegate { Run(true); };
        help.Click += delegate { MessageBox.Show(this, "在原来使用 OshiTrip 的每个浏览器用户配置中，打开原访问地址，通过地址栏的网站设置清除该网站数据。\n这会删除该站点的收藏、关注、行程和浏览器缓存，无法撤销。请先自行备份重要安排。\n曾使用临时端口的地址也需分别处理；不要清空整个浏览器或整个浏览器用户目录。\n\n" + Address(), "浏览器数据说明"); };
        status.SetBounds(22, 264, 615, 120);
        status.Text = "数据目录：" + data + "\n仅清理缓存无需选择程序目录。卸载只处理你选中的一个版本。";
        Controls.AddRange(new Control[] { description, folder, choose, forget, clean, uninstall, help, status });
    }

    private string Address()
    {
        try
        {
            CleanupFiles.CheckPath(Path.Combine(data, "port.txt"), false);
            int port;
            if (int.TryParse(File.ReadAllText(Path.Combine(data, "port.txt")).Trim(), out port) && port >= 1024 && port <= 65535)
                return "原访问地址：http://127.0.0.1:" + port + "/";
        }
        catch { }
        return "默认地址：http://127.0.0.1:43187/（历史临时地址请查看浏览器记录）";
    }

    private void Run(bool uninstall)
    {
        bool first;
        using (var gate = new Mutex(true, @"Local\OshiTrip.Portable", out first))
        {
            if (!first) { MessageBox.Show(this, "请先关闭 OshiTrip 启动器或其他清理工具，再重试。"); return; }
            bool removed = false;
            try
            {
                string target = uninstall ? CleanupFiles.ValidatePackage(folder.Text, AppDomain.CurrentDomain.BaseDirectory) : null;
                var targets = CleanupFiles.CacheTargets(data, forget.Checked);
                string address = Address();
                string plan = (uninstall ? "移入回收站（包括其中所有文件）：\n" + target + "\n\n" : "") + "永久删除：\n" + (targets.Count == 0 ? "没有可清理的缓存。" : string.Join("\n", targets.ToArray())) + "\n\n" + address + "\n" + (forget.Checked ? "访问地址将重置，请记下原地址。" : "保留访问地址。") + "\n浏览器中的收藏、行程和缓存仍需手动清除。\n是否继续？";
                if (MessageBox.Show(this, plan, "确认清理范围", MessageBoxButtons.YesNo, MessageBoxIcon.Warning, MessageBoxDefaultButton.Button2) != DialogResult.Yes) return;
                if (uninstall) { CleanupFiles.ValidatePackage(target, AppDomain.CurrentDomain.BaseDirectory); CleanupFiles.Recycle(target); removed = true; }
                CleanupFiles.ClearCache(data, forget.Checked);
                status.Text = (removed ? "程序已移入回收站，活动缓存与日志已清理。" : "活动缓存与日志已清理。") + "\n" + address + "\n浏览器数据仍保留；需要删除时请点击“浏览器数据说明”。";
            }
            catch (Exception ex)
            {
                status.Text = (removed ? "程序已移入回收站，但缓存清理未全部完成。" : "操作未完成；部分缓存可能已清理。") + "\n" + ex.Message;
                MessageBox.Show(this, status.Text, "OshiTrip", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }
    }
}
