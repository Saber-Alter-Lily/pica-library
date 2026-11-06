using System;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Windows.Forms;

internal static class RcLauncher
{
    [STAThread]
    private static int Main(string[] args)
    {
        try
        {
            string root = AppDomain.CurrentDomain.BaseDirectory;
            string runtime = Path.Combine(root, "runtime", "node.exe");
            string entry = Path.Combine(root, "app", "desktop.js");
            if (!File.Exists(runtime) || !File.Exists(entry))
                throw new FileNotFoundException("The RC runtime is incomplete. Extract the entire ZIP before starting Pica Library.");

            string localAppData = Environment.GetEnvironmentVariable("LOCALAPPDATA");
            if (String.IsNullOrWhiteSpace(localAppData))
                localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            if (String.IsNullOrWhiteSpace(localAppData))
                throw new InvalidOperationException("Windows LocalAppData could not be resolved.");
#if POST_STABLE_RC
            string rcHome = Path.Combine(localAppData, "Pica Library Post Stable RC");
#else
            string rcHome = Path.Combine(localAppData, "Pica Library P2 RC");
#endif

            var quoted = args.Select(Quote);
            var info = new ProcessStartInfo
            {
                FileName = runtime,
                Arguments = Quote(entry) + (args.Length == 0 ? "" : " " + String.Join(" ", quoted)),
                WorkingDirectory = root,
                UseShellExecute = false,
                CreateNoWindow = true,
                WindowStyle = ProcessWindowStyle.Hidden
            };
            info.EnvironmentVariables["PICA_LIBRARY_DESKTOP_HOME"] = rcHome;
#if POST_STABLE_RC
            info.EnvironmentVariables["PICA_LIBRARY_TEST_BUILD"] = "post-stable-unpublished-rc";
#else
            info.EnvironmentVariables["PICA_LIBRARY_TEST_BUILD"] = "p2-unpublished-rc";
#endif
            Process.Start(info);
            return 0;
        }
        catch (Exception error)
        {
            MessageBox.Show(
                "Pica Library RC could not start.\n\n" + error.Message +
                "\n\nExtract the complete RC ZIP and try again.",
                "Pica Library RC",
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
