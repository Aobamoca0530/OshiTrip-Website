using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;

// Built with Windows' .NET Framework compiler; no separate .NET or Node install.
internal static class Program
{
    internal static EventWaitHandle OpenEvent;
    [STAThread]
    private static int Main(string[] args)
    {
        if (args.Length == 2 && args[0] == "--smoke-test") return SmokeTest(args[1]);
        bool first;
        using (var mutex = new Mutex(true, @"Local\OshiTrip.Portable", out first))
        using (OpenEvent = new EventWaitHandle(false, EventResetMode.AutoReset, @"Local\OshiTrip.Open"))
        {
            if (!first) { OpenEvent.Set(); return 0; }
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new LauncherWindow());
        }
        return 0;
    }

    private static int SmokeTest(string reportPath)
    {
        reportPath = Path.GetFullPath(reportPath);
        Directory.CreateDirectory(Path.GetDirectoryName(reportPath));
        var dataDir = Path.Combine(Path.GetDirectoryName(reportPath), "launcher-data");
        int pid = 0;
        try
        {
            using (var server = new LocalServer(dataDir))
            {
                server.Start();
                pid = server.ChildId;
                foreach (var route in new[] { "/", "/events", "/trip", "/releases" })
                    if (!LocalServer.Check(server.Url.TrimEnd('/') + route)) throw new Exception("HTTP check failed: " + route);
                File.WriteAllText(reportPath + ".ready", server.Url + "\n" + pid, Encoding.UTF8);
                // Also allows the external smoke test to inspect CSS, JS and images.
                Thread.Sleep(3000);
                server.Dispose();
                if (!WaitForExit(pid)) throw new Exception("Child process survived shutdown");
                File.WriteAllText(reportPath, "PASS\n" + server.Url + "\nchild=" + pid, Encoding.UTF8);
            }
            return 0;
        }
        catch (Exception ex)
        {
            File.WriteAllText(reportPath, "FAIL\n" + ex.ToString(), Encoding.UTF8);
            return 1;
        }
    }

    private static bool WaitForExit(int pid)
    {
        try { using (var p = Process.GetProcessById(pid)) return p.WaitForExit(5000); }
        catch (ArgumentException) { return true; }
    }
}

internal sealed class LauncherWindow : Form
{
    private readonly Label status = new Label();
    private readonly Button open = new Button();
    private readonly LocalServer server;
    private readonly System.Windows.Forms.Timer timer = new System.Windows.Forms.Timer();
    private bool ready;
    private bool closing;

    internal LauncherWindow()
    {
        Text = "OshiTrip · 本地启动器";
        ClientSize = new Size(510, 228);
        Font = new Font("Microsoft YaHei UI", 10);
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        StartPosition = FormStartPosition.CenterScreen;
        Icon = SystemIcons.Application;
        var title = new Label { Text = "OshiTrip", Font = new Font(Font.FontFamily, 22, FontStyle.Bold), Location = new Point(24, 18), AutoSize = true };
        status.SetBounds(26, 70, 460, 62);
        status.Text = "正在启动，请稍候…";
        open.Text = "打开网站";
        open.SetBounds(26, 144, 130, 36);
        open.Enabled = false;
        open.Click += delegate { OpenBrowser(); };
        var stop = new Button { Text = "停止并退出", Location = new Point(170, 144), Size = new Size(130, 36) };
        stop.Click += delegate { Close(); };
        var note = new Label { Text = "关闭此窗口会停止服务；收藏和行程保存在浏览器中。", Location = new Point(26, 192), AutoSize = true };
        Controls.AddRange(new Control[] { title, status, open, stop, note });
        server = new LocalServer(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "OshiTrip"));
        Shown += async delegate {
            try
            {
                await Task.Run(() => server.Start());
                if (closing) return;
                ready = true;
                open.Enabled = true;
                status.Text = "已启动：" + server.Url + (server.PortChanged ? "\n临时地址；原收藏仍在 " + server.OriginalUrl : "\n浏览器关闭后，可点击下方按钮重新打开。");
                OpenBrowser();
            }
            catch (Exception ex)
            {
                if (closing) return;
                status.Text = "启动失败，请查看提示后重试。";
                MessageBox.Show(this, ex.Message + "\n\n日志：" + server.LogPath, "OshiTrip", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        };
        timer.Interval = 800;
        timer.Tick += delegate {
            if (!ready) return;
            if (!server.IsRunning) { ready = false; open.Enabled = false; status.Text = "本地服务已停止，请关闭启动器后重新启动。"; }
            else if (Program.OpenEvent.WaitOne(0)) { WindowState = FormWindowState.Normal; Activate(); OpenBrowser(); }
        };
        timer.Start();
        FormClosing += delegate { closing = true; timer.Stop(); server.Dispose(); };
    }

    private void OpenBrowser()
    {
        if (!ready) return;
        try { Process.Start(new ProcessStartInfo(server.Url) { UseShellExecute = true }); }
        catch { MessageBox.Show(this, "请在浏览器中打开：\n" + server.Url, "OshiTrip"); }
    }
}

internal sealed class LocalServer : IDisposable
{
    private readonly string root = AppDomain.CurrentDomain.BaseDirectory;
    private readonly string dataDir;
    private readonly object gate = new object();
    private Process child;
    private IntPtr job;
    private bool disposed;
    public string Url { get; private set; }
    public bool PortChanged { get; private set; }
    public string OriginalUrl { get; private set; }
    public string LogPath { get { return Path.Combine(dataDir, "launcher.log"); } }
    public int ChildId { get { lock (gate) return child == null ? 0 : child.Id; } }
    public bool IsRunning { get { lock (gate) return !disposed && child != null && !child.HasExited; } }

    public LocalServer(string directory) { dataDir = directory; }

    public void Start()
    {
        Directory.CreateDirectory(dataDir);
        string node = Path.Combine(root, "runtime", "node.exe");
        if (!File.Exists(node) || !File.Exists(Path.Combine(root, "app", "server.js")))
            throw new Exception("文件不完整。请先解压整个 ZIP，再打开 OshiTrip.exe；不要只移动 EXE。");
        string portFile = Path.Combine(dataDir, "port.txt");
        int preferred = 43187;
        int saved;
        bool hasSavedPort = File.Exists(portFile) && int.TryParse(File.ReadAllText(portFile).Trim(), out saved) && saved >= 1024 && saved < 65536;
        if (hasSavedPort) preferred = int.Parse(File.ReadAllText(portFile).Trim());
        OriginalUrl = "http://127.0.0.1:" + preferred + "/";
        if (File.Exists(LogPath) && new FileInfo(LogPath).Length > 1024 * 1024) File.WriteAllText(LogPath, "");
        try
        {
            for (int attempt = 0; attempt < 5; attempt++)
            {
                int port = attempt == 0 && Available(preferred) ? preferred : FreePort();
                Url = "http://127.0.0.1:" + port + "/";
                PortChanged = port != preferred;
                lock (gate)
                {
                    if (disposed) throw new OperationCanceledException();
                    CreateJob();
                    var info = new ProcessStartInfo(node, "\"" + Path.Combine(root, "bootstrap.mjs") + "\"");
                    info.WorkingDirectory = Path.Combine(root, "app");
                    info.UseShellExecute = false;
                    info.CreateNoWindow = true;
                    info.RedirectStandardInput = true;
                    info.RedirectStandardOutput = true;
                    info.RedirectStandardError = true;
                    // Never inherit database/API credentials or Node preload options.
                    foreach (var key in new[] { "NODE_OPTIONS", "NODE_PATH", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY", "OPENAI_API_KEY", "DASHSCOPE_API_KEY" }) info.EnvironmentVariables.Remove(key);
                    info.EnvironmentVariables["NODE_ENV"] = "production";
                    info.EnvironmentVariables["NEXT_TELEMETRY_DISABLED"] = "1";
                    info.EnvironmentVariables["PORT"] = port.ToString();
                    info.EnvironmentVariables["HOSTNAME"] = "127.0.0.1";
                    child = new Process { StartInfo = info };
                    child.OutputDataReceived += Log;
                    child.ErrorDataReceived += Log;
                    child.Start();
                    if (!AssignProcessToJobObject(job, child.Handle))
                    {
                        child.Kill();
                        throw new Exception("无法管理后台进程，请关闭后重试。Windows 错误：" + Marshal.GetLastWin32Error());
                    }
                    child.BeginOutputReadLine();
                    child.BeginErrorReadLine();
                    child.StandardInput.WriteLine("start");
                    child.StandardInput.Flush();
                }
                var deadline = DateTime.UtcNow.AddSeconds(60);
                while (DateTime.UtcNow < deadline && IsRunning)
                {
                    if (Check(Url) && IsRunning)
                    {
                        // A temporary conflict must not replace the saved browser
                        // origin: return to it on the next launch when it is free.
                        if (!hasSavedPort || !PortChanged) File.WriteAllText(portFile, port.ToString());
                        return;
                    }
                    Thread.Sleep(250);
                }
                lock (gate) { if (disposed) throw new OperationCanceledException(); StopChild(); }
            }
            throw new Exception("本地服务未能启动，请查看日志，或将程序解压到可写目录后重试。");
        }
        catch { Dispose(); throw; }
    }

    public static bool Check(string url)
    {
        try
        {
            var request = (HttpWebRequest)WebRequest.Create(url);
            request.Proxy = null;
            request.Timeout = 1000;
            request.AllowAutoRedirect = false;
            using (var response = (HttpWebResponse)request.GetResponse()) return response.StatusCode == HttpStatusCode.OK;
        }
        catch { return false; }
    }

    private void Log(object sender, DataReceivedEventArgs args)
    {
        if (string.IsNullOrEmpty(args.Data)) return;
        lock (gate) { try { File.AppendAllText(LogPath, DateTime.Now.ToString("s") + " " + args.Data + Environment.NewLine); } catch { } }
    }
    private static bool Available(int port)
    {
        var listener = new TcpListener(IPAddress.Loopback, port);
        try { listener.Server.ExclusiveAddressUse = true; listener.Start(); return true; }
        catch (SocketException) { return false; }
        finally { listener.Stop(); }
    }
    private static int FreePort()
    {
        var listener = new TcpListener(IPAddress.Loopback, 0);
        listener.Start();
        int port = ((IPEndPoint)listener.LocalEndpoint).Port;
        listener.Stop();
        return port;
    }
    public void Dispose() { lock (gate) { if (disposed) return; disposed = true; StopChild(); } }
    private void StopChild()
    {
        if (job != IntPtr.Zero) { CloseHandle(job); job = IntPtr.Zero; }
        if (child != null) { child.Dispose(); child = null; }
    }
    private void CreateJob()
    {
        job = CreateJobObject(IntPtr.Zero, null);
        var limits = new ExtendedLimits();
        limits.Basic.LimitFlags = 0x2000; // JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
        if (job == IntPtr.Zero || !SetInformationJobObject(job, 9, ref limits, (uint)Marshal.SizeOf(limits)))
            throw new Exception("无法创建后台进程管理器。Windows 错误：" + Marshal.GetLastWin32Error());
    }
    [StructLayout(LayoutKind.Sequential)] private struct BasicLimits
    {
        public long PerProcessUserTimeLimit, PerJobUserTimeLimit;
        public uint LimitFlags;
        public UIntPtr MinimumWorkingSetSize, MaximumWorkingSetSize;
        public uint ActiveProcessLimit;
        public UIntPtr Affinity;
        public uint PriorityClass, SchedulingClass;
    }
    [StructLayout(LayoutKind.Sequential)] private struct IoCounters { public ulong ReadOperations, WriteOperations, OtherOperations, ReadBytes, WriteBytes, OtherBytes; }
    [StructLayout(LayoutKind.Sequential)] private struct ExtendedLimits
    {
        public BasicLimits Basic;
        public IoCounters Io;
        public UIntPtr ProcessMemoryLimit, JobMemoryLimit, PeakProcessMemoryUsed, PeakJobMemoryUsed;
    }
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] private static extern IntPtr CreateJobObject(IntPtr attributes, string name);
    [DllImport("kernel32.dll", SetLastError = true)] private static extern bool SetInformationJobObject(IntPtr handle, int type, ref ExtendedLimits limits, uint size);
    [DllImport("kernel32.dll", SetLastError = true)] private static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
    [DllImport("kernel32.dll")] private static extern bool CloseHandle(IntPtr handle);
}
