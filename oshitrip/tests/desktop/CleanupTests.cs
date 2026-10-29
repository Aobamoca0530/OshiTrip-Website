using System;
using System.IO;

internal static class CleanupTests
{
    private static void Assert(bool condition, string message) { if (!condition) throw new Exception(message); }
    private static void Reject(Action action, string message)
    {
        try { action(); } catch (IOException) { return; }
        throw new Exception("Expected refusal: " + message);
    }
    private static void Main(string[] args)
    {
        // Runner creates all fixtures, including the junction, in a fresh folder.
        string root = Path.GetFullPath(args[0]);
        string data = Path.Combine(root, "OshiTrip");
        CleanupFiles.ClearCache(data, false);
        Assert(File.ReadAllText(Path.Combine(data, "port.txt")) == "45000", "Keep origin");
        Assert(File.Exists(Path.Combine(data, "personal.txt")), "Keep unknown files");
        Assert(!Directory.Exists(Path.Combine(data, "data")), "Remove cache");
        Assert(!File.Exists(Path.Combine(data, "launcher.log")), "Remove log");
        CleanupFiles.ClearCache(data, false); // idempotent
        CleanupFiles.ClearCache(data, true);
        Assert(!File.Exists(Path.Combine(data, "port.txt")), "Explicit origin reset");
        Reject(() => CleanupFiles.ClearCache(root, true), "wrong data root");
        string linked = Path.Combine(root, "linked", "OshiTrip");
        Reject(() => CleanupFiles.ClearCache(linked, true), "junction in cache");
        Assert(File.Exists(Path.Combine(linked, "launcher.log")), "Preflight before any deletion");
        Assert(File.ReadAllText(Path.Combine(root, "outside", "keep.txt")) == "safe", "Junction target untouched");
        Reject(() => CleanupFiles.CheckPath(Path.Combine(linked, "data", "keep.txt"), false), "junction ancestor");
        string package = Path.Combine(root, "program");
        Assert(CleanupFiles.ValidatePackage(package, root) == package, "Valid package");
        Reject(() => CleanupFiles.ValidatePackage(package, Path.Combine(package, "tool")), "cleaner inside target");
        File.WriteAllText(Path.Combine(package, "personal.txt"), "preserve");
        Reject(() => CleanupFiles.ValidatePackage(package, root), "extra personal files");
        Reject(() => CleanupFiles.ValidatePackage(root, Path.GetDirectoryName(root)), "unmarked folder");
        File.WriteAllText(Path.Combine(package, ".oshitrip-portable"), "not a version");
        Reject(() => CleanupFiles.ValidatePackage(package, root), "invalid marker");
        string trashFixture = Path.Combine(root, "recycle-only-this-fixture");
        Directory.CreateDirectory(trashFixture);
        File.WriteAllText(Path.Combine(trashFixture, "fixture.txt"), "Disposable OshiTrip cleanup test fixture");
        CleanupFiles.CheckPath(trashFixture, true);
        CleanupFiles.Recycle(trashFixture);
        Assert(!Directory.Exists(trashFixture), "Move fixture to Recycle Bin");
        Assert(File.Exists(Path.Combine(root, "outside", "keep.txt")), "Keep neighboring files");
        Console.WriteLine("PASS: cache removal, origin preservation/reset, idempotence, unknown file preservation, junction/ancestor refusal, preflight, package identity, self-protection and Recycle Bin move");
    }
}
