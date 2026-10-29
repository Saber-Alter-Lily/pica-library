using System;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Windows.Forms;

internal static class Launcher
{
    [STAThread]
    private static int Main(string[] args)
    {
        try
        {
            string root = AppDomain.CurrentDomain.BaseDirectory;
            string runtime = Path.Combine(root, "runtime", "node.exe");
            // The default launcher remains the historical provider-enabled
            // Desktop. The source-free preview is a separate optional binary,
            // selected ONLY by an explicit first argument. It cannot silently
            // fall back into the bundled legacy provider runtime.
            bool sourceFreePreview = args.Length > 0 &&
                String.Equals(args[0], "--source-free-preview", StringComparison.Ordinal);
            string entry = Path.Combine(root, "app",
                sourceFreePreview ? "desktop-core-preview.mjs" : "desktop.js");
            if (!File.Exists(runtime) || !File.Exists(entry))
                throw new FileNotFoundException("The packaged runtime is incomplete. Extract the entire ZIP before starting Pica Library.");

            var forwarded = sourceFreePreview ? args.Skip(1).ToArray() : args;
            var quoted = forwarded.Select(Quote);
            var info = new ProcessStartInfo
            {
                FileName = runtime,
                Arguments = Quote(entry) + (forwarded.Length == 0 ? "" : " " + String.Join(" ", quoted)),
                WorkingDirectory = root,
                UseShellExecute = false,
                CreateNoWindow = true,
                WindowStyle = ProcessWindowStyle.Hidden
            };
            Process.Start(info);
            return 0;
        }
        catch (Exception error)
        {
            MessageBox.Show(
                "Pica Library could not start.\n\n" + error.Message +
                "\n\nExtract the complete ZIP and try again.",
                "Pica Library",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
            return 1;
        }
    }

    private static string Quote(string value)
    {
        return "\"" + value.Replace("\\", "\\\\").Replace("\"", "\\\"") + "\"";
    }
}
