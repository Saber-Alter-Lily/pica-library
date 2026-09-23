import { spawnSync, type SpawnSyncReturns } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { sanitizedChildEnv, windowsExecutable } from './child-process'

export type ManagedBrowserKind = 'edge' | 'chrome' | 'chromium'

export interface ManagedBrowser {
    kind: ManagedBrowserKind
    label: string
    executable: string
}

type SyncRunner = (
    command: string,
    args: readonly string[],
    options: {
        encoding: 'utf8'
        windowsHide: boolean
        env: NodeJS.ProcessEnv
    }
) => SpawnSyncReturns<string>

function browserKind(value: string): ManagedBrowserKind {
    const lower = value.toLowerCase()
    if (lower.includes('edge')) return 'edge'
    if (lower.includes('chromium')) return 'chromium'
    return 'chrome'
}

function browserLabel(kind: ManagedBrowserKind) {
    if (kind === 'edge') return 'Microsoft Edge'
    if (kind === 'chromium') return 'Chromium'
    return 'Google Chrome'
}

function descriptor(executable: string): ManagedBrowser {
    const kind = browserKind(executable)
    return {
        kind,
        label: browserLabel(kind),
        executable
    }
}

function existing(
    values: Iterable<string | undefined>,
    fileExists: (file: string) => boolean
) {
    for (const value of values) {
        const candidate = String(value ?? '').trim()
        if (candidate && fileExists(candidate)) return candidate
    }
    return null
}

function locateOnPath(
    command: string,
    platform: NodeJS.Platform,
    runner: SyncRunner
) {
    const locator =
        platform === 'win32'
            ? windowsExecutable('System32', 'where.exe')
            : '/usr/bin/which'
    const result = runner(locator, [command], {
        encoding: 'utf8',
        windowsHide: true,
        env: sanitizedChildEnv()
    })
    if (result.status !== 0) return null
    return String(result.stdout ?? '')
        .split(/\r?\n/)
        .map((item) => item.trim())
        .find(Boolean) ?? null
}

export function managedBrowserCandidates(
    platform: NodeJS.Platform = process.platform,
    environment: NodeJS.ProcessEnv = process.env,
    home = os.homedir()
) {
    const override = environment.PICA_LIBRARY_BROWSER_PATH?.trim()
    if (platform === 'win32') {
        const roots = [
            environment['ProgramFiles(x86)'],
            environment.ProgramFiles,
            environment.LOCALAPPDATA
        ].filter((value): value is string => Boolean(value))
        return [
            override,
            ...roots.map((root) =>
                path.win32.join(
                    root,
                    'Microsoft',
                    'Edge',
                    'Application',
                    'msedge.exe'
                )
            ),
            ...roots.map((root) =>
                path.win32.join(
                    root,
                    'Google',
                    'Chrome',
                    'Application',
                    'chrome.exe'
                )
            )
        ].filter((value): value is string => Boolean(value))
    }
    if (platform === 'darwin') {
        const appRoots = ['/Applications', path.join(home, 'Applications')]
        const bundles = [
            [
                'Microsoft Edge.app',
                'Contents',
                'MacOS',
                'Microsoft Edge'
            ],
            [
                'Google Chrome.app',
                'Contents',
                'MacOS',
                'Google Chrome'
            ],
            ['Chromium.app', 'Contents', 'MacOS', 'Chromium']
        ]
        return [
            override,
            ...appRoots.flatMap((root) =>
                bundles.map((parts) => path.join(root, ...parts))
            )
        ].filter((value): value is string => Boolean(value))
    }
    if (platform === 'linux')
        return [
            override,
            '/usr/bin/microsoft-edge-stable',
            '/usr/bin/microsoft-edge',
            '/usr/bin/google-chrome-stable',
            '/usr/bin/google-chrome',
            '/usr/bin/chromium',
            '/usr/bin/chromium-browser',
            '/snap/bin/chromium'
        ].filter((value): value is string => Boolean(value))
    return override ? [override] : []
}

export function discoverManagedBrowser(
    platform: NodeJS.Platform = process.platform,
    options: {
        environment?: NodeJS.ProcessEnv
        home?: string
        fileExists?: (file: string) => boolean
        runner?: SyncRunner
    } = {}
): ManagedBrowser | null {
    const environment = options.environment ?? process.env
    const home = options.home ?? os.homedir()
    const fileExists = options.fileExists ?? fs.existsSync
    const runner = options.runner ?? (spawnSync as SyncRunner)
    const direct = existing(
        managedBrowserCandidates(platform, environment, home),
        fileExists
    )
    if (direct) return descriptor(direct)

    const commands =
        platform === 'win32'
            ? ['msedge.exe', 'chrome.exe']
            : platform === 'linux'
              ? [
                    'microsoft-edge-stable',
                    'microsoft-edge',
                    'google-chrome-stable',
                    'google-chrome',
                    'chromium',
                    'chromium-browser'
                ]
              : []
    for (const command of commands) {
        try {
            const located = locateOnPath(command, platform, runner)
            if (located && fileExists(located)) return descriptor(located)
        } catch {
            // Continue with the next browser candidate.
        }
    }
    return null
}
