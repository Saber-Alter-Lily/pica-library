import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import path from 'node:path'

export function sanitizedChildEnv(
    environment: NodeJS.ProcessEnv = process.env
): NodeJS.ProcessEnv {
    return Object.fromEntries(
        Object.entries(environment).filter(
            ([name]) => !name.toUpperCase().startsWith('PICA_')
        )
    )
}

export function windowsExecutable(...parts: string[]) {
    return path.join(process.env.SystemRoot ?? 'C:\\Windows', ...parts)
}

export function showBrowserFallback(url: string) {
    if (process.platform !== 'win32') return
    const script =
        "[void][Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms');" +
        '$u=[Console]::In.ReadToEnd();' +
        '[Windows.Forms.Clipboard]::SetText($u);' +
        '[Windows.Forms.MessageBox]::Show("Pica Library 已启动 / is running at:"+[Environment]::NewLine+[Environment]::NewLine+$u+[Environment]::NewLine+[Environment]::NewLine+"地址已复制到剪贴板。"+[Environment]::NewLine+"The address has been copied to the clipboard.","打开 / Open Pica Library",[Windows.Forms.MessageBoxButtons]::OK,[Windows.Forms.MessageBoxIcon]::Information) | Out-Null'
    spawnSync(
        windowsExecutable(
            'System32',
            'WindowsPowerShell',
            'v1.0',
            'powershell.exe'
        ),
        [
            '-NoLogo',
            '-NoProfile',
            '-NonInteractive',
            '-STA',
            '-Command',
            script
        ],
        {
            input: url,
            encoding: 'utf8',
            windowsHide: true,
            env: sanitizedChildEnv()
        }
    )
}

export function launchBrowser(
    url: string,
    onFailure: (error: unknown) => void,
    spawnProcess: typeof spawn = spawn
) {
    let child: ChildProcess
    try {
        child = spawnProcess(
            windowsExecutable('System32', 'cmd.exe'),
            ['/d', '/s', '/c', 'start', '', url],
            {
                detached: true,
                stdio: 'ignore',
                windowsHide: true,
                env: sanitizedChildEnv()
            }
        )
    } catch (error) {
        onFailure(error)
        return false
    }
    let failed = false
    const fail = (error: unknown) => {
        if (failed) return
        failed = true
        onFailure(error)
    }
    child.once('error', fail)
    child.once('exit', (code, signal) => {
        if (code !== 0 || signal)
            fail(new Error(`Browser launcher exited with code ${code}`))
    })
    child.unref()
    return true
}
