import { EventEmitter } from 'node:events'
import { describe, expect, it } from 'vitest'
import {
    browserLaunchSpec,
    defaultDesktopRoot,
    desktopPlatformCapabilities,
    desktopPlatformId,
    directoryLaunchSpec
} from '../../src/desktop/platform'
import {
    launchBrowser,
    launchDirectory
} from '../../src/desktop/child-process'
import fs from 'node:fs'
import { appCapabilities } from '../../src/app-capabilities'

describe('Desktop platform foundation', () => {
    it('maps supported Node platforms without claiming unfinished integrations', () => {
        expect(desktopPlatformId('win32')).toBe('windows')
        expect(desktopPlatformId('darwin')).toBe('macos')
        expect(desktopPlatformId('linux')).toBe('linux')
        expect(desktopPlatformId('freebsd')).toBe('unsupported')

        expect(desktopPlatformCapabilities('win32', 'x64')).toMatchObject({
            id: 'windows',
            arch: 'x64',
            runtimeFoundation: true,
            distributionReady: true,
            browserLaunch: true,
            directoryLaunch: true,
            secureCredentialPersistence: true,
            nativeFolderPicker: true,
            nativeSavePicker: true,
            managedEhWebLogin: true,
            selfUpdate: true
        })
        expect(desktopPlatformCapabilities('win32', 'arm64')).toMatchObject({
            id: 'windows',
            arch: 'arm64',
            runtimeFoundation: true,
            distributionReady: false,
            browserLaunch: true,
            directoryLaunch: true,
            secureCredentialPersistence: true,
            nativeFolderPicker: true,
            nativeSavePicker: true,
            managedEhWebLogin: true,
            selfUpdate: false
        })
        for (const platform of ['darwin', 'linux'] as const)
            expect(desktopPlatformCapabilities(platform, 'arm64')).toMatchObject({
                runtimeFoundation: true,
                distributionReady: false,
                browserLaunch: true,
                directoryLaunch: true,
                secureCredentialPersistence: false,
                nativeFolderPicker: false,
                nativeSavePicker: false,
                managedEhWebLogin: false,
                selfUpdate: false
            })
    })

    it('preserves the Windows data root and defines native macOS/Linux roots', () => {
        expect(
            defaultDesktopRoot(
                'win32',
                { LOCALAPPDATA: 'D:\\Users\\Test\\Local' },
                'C:\\Users\\Test'
            )
        ).toBe('D:\\Users\\Test\\Local\\Pica Library')
        expect(defaultDesktopRoot('darwin', {}, '/Users/test')).toBe(
            '/Users/test/Library/Application Support/Pica Library'
        )
        expect(
            defaultDesktopRoot(
                'linux',
                { XDG_DATA_HOME: '/mnt/user-data' },
                '/home/test'
            )
        ).toBe('/mnt/user-data/pica-library')
        expect(defaultDesktopRoot('linux', {}, '/home/test')).toBe(
            '/home/test/.local/share/pica-library'
        )
    })

    it('uses native default-browser and directory launchers per platform', () => {
        expect(
            browserLaunchSpec(
                'http://127.0.0.1:4789',
                'win32',
                { SystemRoot: 'C:\\Windows' }
            )
        ).toEqual({
            command: 'C:\\Windows\\System32\\cmd.exe',
            args: [
                '/d',
                '/s',
                '/c',
                'start',
                '',
                'http://127.0.0.1:4789'
            ]
        })
        expect(browserLaunchSpec('https://example.test', 'darwin')).toEqual({
            command: 'open',
            args: ['https://example.test']
        })
        expect(browserLaunchSpec('https://example.test', 'linux')).toEqual({
            command: 'xdg-open',
            args: ['https://example.test']
        })
        expect(
            directoryLaunchSpec('/tmp/Pica Library', 'darwin')
        ).toEqual({
            command: 'open',
            args: ['/tmp/Pica Library']
        })
        expect(
            directoryLaunchSpec('/tmp/pica-library', 'linux')
        ).toEqual({
            command: 'xdg-open',
            args: ['/tmp/pica-library']
        })
        expect(
            directoryLaunchSpec(
                'D:\\Pica',
                'win32',
                { SystemRoot: 'C:\\Windows' }
            )
        ).toEqual({
            command: 'C:\\Windows\\explorer.exe',
            args: ['D:\\Pica']
        })
        expect(browserLaunchSpec('https://example.test', 'freebsd')).toBeNull()
        expect(directoryLaunchSpec('/tmp', 'freebsd')).toBeNull()
    })

    it('routes injected launches through the selected platform without exposing PICA secrets', () => {
        const makeChild = () => {
            const child = new EventEmitter() as EventEmitter & {
                unref: () => void
            }
            child.unref = () => undefined
            return child
        }
        const calls: Array<{
            command: string
            args: string[]
            env?: NodeJS.ProcessEnv
        }> = []
        const spawnMock = ((
            command: string,
            args: string[],
            options: { env?: NodeJS.ProcessEnv }
        ) => {
            calls.push({ command, args, env: options.env })
            return makeChild()
        }) as never

        expect(
            launchBrowser(
                'https://example.test',
                () => {
                    throw new Error('unexpected browser failure')
                },
                spawnMock,
                'linux'
            )
        ).toBe(true)
        expect(
            launchDirectory(
                '/tmp/library',
                () => {
                    throw new Error('unexpected directory failure')
                },
                spawnMock,
                'darwin'
            )
        ).toBe(true)

        expect(calls[0]).toMatchObject({
            command: 'xdg-open',
            args: ['https://example.test']
        })
        expect(calls[1]).toMatchObject({
            command: 'open',
            args: ['/tmp/library']
        })
        for (const call of calls)
            expect(
                Object.keys(call.env ?? {}).some((key) =>
                    key.toUpperCase().startsWith('PICA_')
                )
            ).toBe(false)
    })

    it('publishes structured supported/available/reason runtime capabilities', () => {
        const windows = appCapabilities(false, 'win32', 'x64', {
            runtime: { mode: 'interactive' },
            platform: {
                id: 'windows',
                arch: 'x64',
                runtimeFoundation: true,
                selfUpdate: true
            },
            credentialBackend: { securePersistence: true },
            nativePicker: {
                backend: 'windows-winforms',
                folderPicker: true,
                savePicker: true
            },
            managedEhBrowser: { kind: 'edge' }
        })
        expect(windows.features.updatePackages).toBe(true)
        expect(windows.runtime).toEqual({
            role: 'desktop',
            mode: 'interactive',
            platform: 'windows',
            arch: 'x64'
        })
        expect(windows.capabilityStates.selfUpdate).toEqual({
            supported: true,
            available: true,
            execution: 'platform-host',
            reason: 'Available'
        })
        expect(windows.features.remoteApi).toBe(false)
        expect(windows.features.remoteWebSessions).toBe(false)
        expect(windows.features.remoteWebShell).toBe(false)
        expect(windows.capabilityStates.remoteApi).toMatchObject({
            supported: false,
            available: false,
            reason: 'UnavailableInRuntime'
        })
        expect(windows.capabilityStates.remoteWebSessions).toMatchObject({
            supported: false,
            available: false,
            reason: 'UnavailableInRuntime'
        })
        expect(windows.capabilityStates.remoteWebShell).toMatchObject({
            supported: false,
            available: false,
            reason: 'UnavailableInRuntime'
        })

        const linux = appCapabilities(false, 'linux', 'x64', {
            runtime: { mode: 'headless' },
            platform: {
                id: 'linux',
                arch: 'x64',
                runtimeFoundation: true,
                selfUpdate: false
            },
            credentialBackend: { securePersistence: false },
            nativePicker: {
                backend: 'unavailable',
                folderPicker: false,
                savePicker: false
            },
            managedEhBrowser: null
        })
        expect(linux.features.updatePackages).toBe(false)
        expect(linux.runtime).toEqual({
            role: 'server',
            mode: 'headless',
            platform: 'linux',
            arch: 'x64'
        })
        expect(linux.capabilityStates.selfUpdate).toMatchObject({
            supported: false,
            available: false,
            reason: 'UnsupportedPlatform'
        })
        expect(linux.capabilityStates.nativeFolderPicker).toMatchObject({
            supported: true,
            available: false,
            reason: 'MissingSystemDependency'
        })
        expect(linux.capabilityStates.secureCredentialPersistence).toMatchObject({
            supported: true,
            available: false,
            reason: 'MissingSecureCredentialBackend'
        })
        expect(linux.capabilityStates.managedEhWebLogin).toMatchObject({
            supported: true,
            available: false,
            reason: 'MissingManagedBrowser'
        })
        expect(linux.features.remoteApi).toBe(false)
        expect(linux.features.remoteWebSessions).toBe(false)
        expect(linux.features.remoteWebShell).toBe(false)
        expect(linux.capabilityStates.remoteApi).toMatchObject({
            supported: true,
            available: false,
            execution: 'platform-host',
            reason: 'DisabledByConfiguration'
        })
        expect(linux.capabilityStates.remoteWebSessions).toMatchObject({
            supported: true,
            available: false,
            execution: 'platform-host',
            reason: 'DisabledByConfiguration'
        })
        expect(linux.capabilityStates.remoteWebShell).toMatchObject({
            supported: true,
            available: false,
            execution: 'platform-host',
            reason: 'DisabledByConfiguration'
        })

        const linuxRemote = appCapabilities(false, 'linux', 'x64', {
            runtime: { mode: 'headless' },
            platform: {
                id: 'linux',
                arch: 'x64',
                runtimeFoundation: true,
                selfUpdate: false
            },
            remoteApi: {
                enabled: true,
                webSessions: true,
                webShell: true
            }
        })
        expect(linuxRemote.features.remoteApi).toBe(true)
        expect(linuxRemote.features.remoteWebSessions).toBe(true)
        expect(linuxRemote.features.remoteWebShell).toBe(true)
        expect(linuxRemote.capabilityStates.remoteApi).toMatchObject({
            supported: true,
            available: true,
            execution: 'platform-host',
            reason: 'Available'
        })
        expect(linuxRemote.capabilityStates.remoteWebSessions).toMatchObject({
            supported: true,
            available: true,
            execution: 'platform-host',
            reason: 'Available'
        })
        expect(linuxRemote.capabilityStates.remoteWebShell).toMatchObject({
            supported: true,
            available: true,
            execution: 'platform-host',
            reason: 'Available'
        })

        const windowsArm = appCapabilities(false, 'win32', 'arm64', {
            runtime: { mode: 'interactive' },
            platform: {
                id: 'windows',
                arch: 'arm64',
                runtimeFoundation: true,
                selfUpdate: false
            }
        })
        expect(windowsArm.features.updatePackages).toBe(false)
        expect(windowsArm.capabilityStates.selfUpdate).toMatchObject({
            supported: false,
            available: false,
            reason: 'UnsupportedPlatform'
        })
    })

    it('publishes the runtime capability matrix through Desktop status', () => {
        const main = fs.readFileSync('src/desktop/main.ts', 'utf8')
        expect(main).toContain('...desktopPlatformCapabilities()')
        expect(main).toContain('target: updateTargetFromRuntime()')
        expect(main).toContain(
            'secureCredentialPersistence:'
        )
        expect(main).toContain(
            'credentialBackend.status.securePersistence'
        )
        expect(main).toContain('platform: platformCapabilities')
        expect(main).toContain('launchDirectory(directory')
        expect(main).not.toContain(
            "spawn(windowsExecutable('explorer.exe'), [directory]"
        )
    })
})
