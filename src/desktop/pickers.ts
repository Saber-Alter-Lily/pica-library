import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import { sanitizedChildEnv, windowsExecutable } from './child-process'

export type DesktopPickerBackend =
    | 'windows-winforms'
    | 'macos-osascript'
    | 'linux-zenity'
    | 'linux-kdialog'
    | 'unavailable'

export interface DesktopPickerStatus {
    backend: DesktopPickerBackend
    folderPicker: boolean
    savePicker: boolean
}

type SpawnProcess = typeof spawn
type SpawnSyncProcess = typeof spawnSync

function commandAvailable(
    command: string,
    args: string[],
    runner: SpawnSyncProcess = spawnSync
) {
    const result = runner(command, args, {
        encoding: 'utf8',
        windowsHide: true,
        env: sanitizedChildEnv()
    })
    return !(
        result.error &&
        (result.error as NodeJS.ErrnoException).code === 'ENOENT'
    )
}

export function desktopPickerStatus(
    platform: NodeJS.Platform = process.platform,
    options: {
        spawnSyncProcess?: SpawnSyncProcess
    } = {}
): DesktopPickerStatus {
    if (platform === 'win32')
        return {
            backend: 'windows-winforms',
            folderPicker: true,
            savePicker: true
        }
    if (platform === 'darwin')
        return {
            backend: 'macos-osascript',
            folderPicker: true,
            savePicker: true
        }
    if (platform === 'linux') {
        const runner = options.spawnSyncProcess ?? spawnSync
        if (commandAvailable('zenity', ['--version'], runner))
            return {
                backend: 'linux-zenity',
                folderPicker: true,
                savePicker: true
            }
        if (commandAvailable('kdialog', ['--version'], runner))
            return {
                backend: 'linux-kdialog',
                folderPicker: true,
                savePicker: true
            }
    }
    return {
        backend: 'unavailable',
        folderPicker: false,
        savePicker: false
    }
}

function applescriptString(value: string) {
    return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')
}

function windowsPowerShell() {
    return windowsExecutable(
        'System32',
        'WindowsPowerShell',
        'v1.0',
        'powershell.exe'
    )
}

function pickerCommand(input: {
    backend: DesktopPickerBackend
    kind: 'folder' | 'save'
    title: string
    defaultName?: string
    extension?: string
}): {
    command: string
    args: string[]
    cancelCodes: number[]
    cancelErrorPattern?: RegExp
} | null {
    if (input.backend === 'windows-winforms') {
        const title = input.title.replaceAll("'", "''")
        const script =
            input.kind === 'folder'
                ? `[void][Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms');$d=New-Object Windows.Forms.FolderBrowserDialog;$d.Description='${title}';if($d.ShowDialog() -eq 'OK'){[Console]::Out.Write($d.SelectedPath)}`
                : (() => {
                      const name = (input.defaultName ?? 'pica-library-export')
                          .replaceAll("'", "''")
                      const extension = (input.extension ?? '')
                          .replace(/[^a-z0-9]/gi, '')
                          .toLowerCase()
                      const filter = extension
                          ? `${extension.toUpperCase()} files (*.${extension})|*.${extension}`
                          : 'All files (*.*)|*.*'
                      return `[void][Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms');$d=New-Object Windows.Forms.SaveFileDialog;$d.FileName='${name}';$d.Filter='${filter}';${extension ? `$d.DefaultExt='${extension}';` : ''}$d.AddExtension=$true;if($d.ShowDialog() -eq 'OK'){[Console]::Out.Write($d.FileName)}`
                  })()
        return {
            command: windowsPowerShell(),
            args: [
                '-NoLogo',
                '-NoProfile',
                '-NonInteractive',
                '-STA',
                '-Command',
                script
            ],
            cancelCodes: []
        }
    }
    if (input.backend === 'macos-osascript') {
        const title = applescriptString(input.title)
        const script =
            input.kind === 'folder'
                ? `POSIX path of (choose folder with prompt "${title}")`
                : `POSIX path of (choose file name with prompt "${title}" default name "${applescriptString(
                      input.defaultName ?? 'pica-library-export'
                  )}")`
        return {
            command: '/usr/bin/osascript',
            args: ['-e', script],
            cancelCodes: [1],
            cancelErrorPattern: /User canceled|-128/i
        }
    }
    if (input.backend === 'linux-zenity') {
        const args = [
            '--file-selection',
            `--title=${input.title}`
        ]
        if (input.kind === 'folder') args.push('--directory')
        else {
            args.push('--save', '--confirm-overwrite')
            if (input.defaultName)
                args.push(
                    `--filename=${path.join(os.homedir(), input.defaultName)}`
                )
            if (input.extension) {
                const extension = input.extension.replace(/[^a-z0-9]/gi, '')
                if (extension)
                    args.push(
                        `--file-filter=${extension.toUpperCase()} files | *.${extension}`
                    )
            }
        }
        return { command: 'zenity', args, cancelCodes: [1] }
    }
    if (input.backend === 'linux-kdialog') {
        if (input.kind === 'folder')
            return {
                command: 'kdialog',
                args: [
                    '--title',
                    input.title,
                    '--getexistingdirectory',
                    os.homedir()
                ],
                cancelCodes: [1]
            }
        const extension = (input.extension ?? '').replace(/[^a-z0-9]/gi, '')
        const start = path.join(
            os.homedir(),
            input.defaultName ?? 'pica-library-export'
        )
        const args = [
            '--title',
            input.title,
            '--getsavefilename',
            start
        ]
        if (extension) args.push(`*.${extension}`)
        return { command: 'kdialog', args, cancelCodes: [1] }
    }
    return null
}

function runPicker(
    spec: ReturnType<typeof pickerCommand>,
    spawnProcess: SpawnProcess = spawn
) {
    if (!spec) return Promise.resolve<string | null>(null)
    return new Promise<string | null>((resolve, reject) => {
        let child: ChildProcess
        try {
            child = spawnProcess(spec.command, spec.args, {
                windowsHide: true,
                env: sanitizedChildEnv()
            })
        } catch (error) {
            reject(error)
            return
        }
        let output = ''
        let errorOutput = ''
        child.stdout?.on('data', (chunk) => {
            output += String(chunk)
        })
        child.stderr?.on('data', (chunk) => {
            errorOutput += String(chunk)
        })
        child.once('error', reject)
        child.once('exit', (code) => {
            if (code === 0) {
                resolve(output.trim() || null)
                return
            }
            if (
                code !== null &&
                spec.cancelCodes.includes(code) &&
                (!spec.cancelErrorPattern ||
                    spec.cancelErrorPattern.test(errorOutput))
            ) {
                resolve(null)
                return
            }
            reject(
                new Error(
                    errorOutput.trim() ||
                        `Native file picker exited with code ${code}`
                )
            )
        })
    })
}

export class DesktopNativePicker {
    readonly status: DesktopPickerStatus

    constructor(
        platform: NodeJS.Platform = process.platform,
        private readonly spawnProcess: SpawnProcess = spawn,
        spawnSyncProcess: SpawnSyncProcess = spawnSync
    ) {
        this.status = desktopPickerStatus(platform, { spawnSyncProcess })
    }

    chooseFolder(title = 'Choose the Pica Library folder') {
        return runPicker(
            pickerCommand({
                backend: this.status.backend,
                kind: 'folder',
                title
            }),
            this.spawnProcess
        )
    }

    chooseSaveFile(input: {
        title: string
        defaultName: string
        extension: string
    }) {
        return runPicker(
            pickerCommand({
                backend: this.status.backend,
                kind: 'save',
                ...input
            }),
            this.spawnProcess
        )
    }
}
