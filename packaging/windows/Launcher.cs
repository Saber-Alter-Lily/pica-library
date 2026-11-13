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
            // No-source modes are opt-in and never fall back to legacy.
            // Default launch remains the official provider-enabled Desktop.
            bool sourceFreePreview = args.Length > 0 &&
                String.Equals(args[0], "--source-free-preview", StringComparison.Ordinal);
            bool sourceFreeLocal = args.Length > 0 &&
                String.Equals(args[0], "--source-free-local", StringComparison.Ordinal);
            bool optionalHost = args.Length > 0 &&
                String.Equals(args[0], "--source-free-user-host", StringComparison.Ordinal);
            bool optionalHostPreview = args.Length > 0 &&
                String.Equals(args[0], "--source-free-host-preview", StringComparison.Ordinal);
            if ((sourceFreeLocal || optionalHost) && args.Length != 1)
                throw new ArgumentException("Local / optional Host mode accepts no extra arguments.");
            if (optionalHostPreview && (args.Length != 4 ||
                !String.Equals(args[1], "--owned-temp-root", StringComparison.Ordinal) ||
                !String.Equals(args[3], "--explicit-preview-only", StringComparison.Ordinal)))
                throw new ArgumentException("Optional Host preview requires explicit owned temporary root.");
            string entry = Path.Combine(root, "app",
                optionalHost || optionalHostPreview ? "desktop-core-host-preview.mjs" :
                sourceFreePreview || sourceFreeLocal ? "desktop-core-preview.mjs" : "desktop.js");
            if (!File.Exists(runtime) || !File.Exists(entry))
                throw new FileNotFoundException("The packaged runtime is incomplete. Extract the entire ZIP before starting Pica Library.");

            var forwarded = optionalHost
                ? new[] { "--persistent-local-profile", "--explicit-user-host-preview" }
                : optionalHostPreview ? args.Skip(1).Concat(
                    new[] { "--explicit-user-host-preview" }).ToArray()
                : sourceFreeLocal ? new[] { "--persistent-local-profile" }
                : sourceFreePreview ? args.Skip(1).ToArray() : args;
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
