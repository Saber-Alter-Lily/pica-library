import { spawnSync, type SpawnSyncReturns } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { sanitizedChildEnv } from './child-process'

export type ManagedBrowserKind = 'edge' | 'chrome' | 'chromium'

export interface ManagedBrowser {
    kind: ManagedBrowserKind
    displayName: string
    executable: string
}

type SyncRunner = (
    command: string,
    args: readonly string[],
    options: {
        encoding: 'utf8'
        windowsHide: boolean
        env: NodeJS.ProcessEnv
        timeout: number
    }
) => SpawnSyncReturns<string>

interface Candidate {
    kind: ManagedBrowserKind
    displayName: string
    executable: string
    filePath?: boolean
}

function windowsCandidates(
    environment: NodeJS.ProcessEnv
): Candidate[] {
    const roots = [
        environment['ProgramFiles(x86)'],
        environment.ProgramFiles,
        environment.LOCALAPPDATA
    ].filter((value): value is string => Boolean(value))
    const out: Candidate[] = []
    for (const root of roots) {
        out.push(
            {
                kind: 'edge',
                displayName: 'Microsoft Edge',
                executable: path.win32.join(
                    root,
                    'Microsoft',
                    'Edge',
                    'Application',
                    'msedge.exe'
                ),
                filePath: true
            },
            {
                kind: 'chrome',
                displayName: 'Google Chrome',
                executable: path.win32.join(
                    root,
                    'Google',
                    'Chrome',
                    'Application',
                    'chrome.exe'
                ),
                filePath: true
            }
        )
    }
    return [
        ...out,
        {
            kind: 'edge',
            displayName: 'Microsoft Edge',
            executable: 'msedge.exe'
        },
        {
            kind: 'chrome',
            displayName: 'Google Chrome',
            executable: 'chrome.exe'
        },
        {
            kind: 'chromium',
            displayName: 'Chromium',
            executable: 'chromium.exe'
        }
    ]
}

function macCandidates(home: string): Candidate[] {
    const locations: Array<
        [ManagedBrowserKind, string, string]
    > = [
        [
            'chrome',
            'Google Chrome',
            'Google Chrome.app/Contents/MacOS/Google Chrome'
        ],
        [
            'edge',
            'Microsoft Edge',
            'Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
        ],
        [
            'chromium',
            'Chromium',
            'Chromium.app/Contents/MacOS/Chromium'
        ]
    ]
    return locations.flatMap(([kind, displayName, suffix]) => [
        {
            kind,
            displayName,
            executable: path.join('/Applications', suffix),
            filePath: true
        },
        {
            kind,
            displayName,
            executable: path.join(home, 'Applications', suffix),
            filePath: true
        }
    ])
}

function linuxCandidates(): Candidate[] {
    return [
        {
            kind: 'chrome',
            displayName: 'Google Chrome',
            executable: 'google-chrome'
        },
        {
            kind: 'chrome',
            displayName: 'Google Chrome',
            executable: 'google-chrome-stable'
        },
        {
            kind: 'chromium',
            displayName: 'Chromium',
            executable: 'chromium'
        },
        {
            kind: 'chromium',
            displayName: 'Chromium',
            executable: 'chromium-browser'
        },
        {
            kind: 'edge',
            displayName: 'Microsoft Edge',
            executable: 'microsoft-edge'
        },
        {
            kind: 'edge',
            displayName: 'Microsoft Edge',
            executable: 'microsoft-edge-stable'
        }
    ]
}

function probeExecutable(
    candidate: Candidate,
    runner: SyncRunner,
    environment: NodeJS.ProcessEnv
) {
    if (candidate.filePath) return false
    const result = runner(candidate.executable, ['--version'], {
        encoding: 'utf8',
        windowsHide: true,
        env: sanitizedChildEnv(environment),
        timeout: 2_500
    })
    if (
        result.error &&
        (result.error as NodeJS.ErrnoException).code === 'ENOENT'
    )
        return false
    return result.status === 0
}

export function findManagedBrowser(
    options: {
        platform?: NodeJS.Platform
        environment?: NodeJS.ProcessEnv
        home?: string
        fileExists?: (file: string) => boolean
        runner?: SyncRunner
    } = {}
): ManagedBrowser | null {
    const platform = options.platform ?? process.platform
    const environment = options.environment ?? process.env
    const home = options.home ?? os.homedir()
    const fileExists = options.fileExists ?? fs.existsSync
    const runner = options.runner ?? (spawnSync as SyncRunner)
    const candidates =
        platform === 'win32'
            ? windowsCandidates(environment)
            : platform === 'darwin'
              ? macCandidates(home)
              : platform === 'linux'
                ? linuxCandidates()
                : []

    for (const candidate of candidates) {
        const available = candidate.filePath
            ? fileExists(candidate.executable)
            : probeExecutable(candidate, runner, environment)
        if (!available) continue
        return {
            kind: candidate.kind,
            displayName: candidate.displayName,
            executable: candidate.executable
        }
    }
    return null
}
