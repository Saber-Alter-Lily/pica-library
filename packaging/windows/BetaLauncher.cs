using System;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Windows.Forms;

internal static class BetaLauncher
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
                throw new FileNotFoundException("The beta runtime is incomplete. Extract the entire ZIP before starting Pica Library V5 Beta.");

            string localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            if (String.IsNullOrWhiteSpace(localAppData))
                throw new InvalidOperationException("Windows LocalAppData could not be resolved.");
            string betaHome = Path.Combine(localAppData, "Pica Library V4 Beta");

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
            info.EnvironmentVariables["PICA_LIBRARY_DESKTOP_HOME"] = betaHome;
            info.EnvironmentVariables["PICA_LIBRARY_TEST_BUILD"] = "recommendation-v5-beta";
            Process.Start(info);
            return 0;
        }
        catch (Exception error)
        {
            MessageBox.Show(
                "Pica Library V5 Beta could not start.\n\n" + error.Message +
                "\n\nExtract the complete beta ZIP and try again.",
                "Pica Library V5 Beta",
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
