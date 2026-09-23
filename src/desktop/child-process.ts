import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import path from 'node:path'
import {
    browserLaunchSpec,
    directoryLaunchSpec,
    type DesktopLaunchSpec
} from './platform'

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
    if (process.platform !== 'win32') {
        console.error(`Pica Library is running at: ${url}`)
        return
    }
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

function launchSpec(
    spec: DesktopLaunchSpec | null,
    onFailure: (error: unknown) => void,
    spawnProcess: typeof spawn,
    platform: NodeJS.Platform
) {
    if (!spec) {
        onFailure(new Error(`Desktop launch is not supported on ${platform}`))
        return false
    }
    let child: ChildProcess
    try {
        child = spawnProcess(spec.command, spec.args, {
            detached: true,
            stdio: 'ignore',
            windowsHide: platform === 'win32',
            env: sanitizedChildEnv()
        })
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
            fail(new Error(`Desktop launcher exited with code ${code}`))
    })
    child.unref()
    return true
}

export function launchBrowser(
    url: string,
    onFailure: (error: unknown) => void,
    spawnProcess: typeof spawn = spawn,
    platform: NodeJS.Platform = process.platform
) {
    return launchSpec(
        browserLaunchSpec(url, platform),
        onFailure,
        spawnProcess,
        platform
    )
}

export function launchDirectory(
    directory: string,
    onFailure: (error: unknown) => void,
    spawnProcess: typeof spawn = spawn,
    platform: NodeJS.Platform = process.platform
) {
    return launchSpec(
        directoryLaunchSpec(directory, platform),
        onFailure,
        spawnProcess,
        platform
    )
}
