import os from 'node:os'
import path from 'node:path'

export type DesktopPlatformId = 'windows' | 'macos' | 'linux' | 'unsupported'

export interface DesktopPlatformCapabilities {
    id: DesktopPlatformId
    arch: string
    browserLaunch: boolean
    secureCredentialPersistence: boolean
    nativeFolderPicker: boolean
    nativeSavePicker: boolean
    managedEhWebLogin: boolean
    selfUpdate: boolean
}

export interface BrowserLaunchSpec {
    command: string
    args: string[]
}

export function desktopPlatformId(
    platform: NodeJS.Platform = process.platform
): DesktopPlatformId {
    if (platform === 'win32') return 'windows'
    if (platform === 'darwin') return 'macos'
    if (platform === 'linux') return 'linux'
    return 'unsupported'
}

export function desktopPlatformCapabilities(
    platform: NodeJS.Platform = process.platform,
    arch = process.arch
): DesktopPlatformCapabilities {
    const id = desktopPlatformId(platform)
    return {
        id,
        arch,
        browserLaunch: id !== 'unsupported',
        // Only Windows is wired to a production credential store and native
        // system integrations today. macOS/Linux remain explicit foundation
        // targets until their secure adapters are implemented and tested.
        secureCredentialPersistence: id === 'windows',
        nativeFolderPicker: id === 'windows',
        nativeSavePicker: id === 'windows',
        managedEhWebLogin: id === 'windows',
        selfUpdate: id === 'windows'
    }
}

export function defaultDesktopRoot(
    platform: NodeJS.Platform = process.platform,
    environment: NodeJS.ProcessEnv = process.env,
    home = os.homedir()
) {
    if (platform === 'win32')
        return path.join(
            environment.LOCALAPPDATA ?? path.join(home, 'AppData', 'Local'),
            'Pica Library'
        )
    if (platform === 'darwin')
        return path.join(home, 'Library', 'Application Support', 'Pica Library')
    if (platform === 'linux')
        return environment.XDG_DATA_HOME
            ? path.join(environment.XDG_DATA_HOME, 'pica-library')
            : path.join(home, '.local', 'share', 'pica-library')
    return path.join(home, '.pica-library')
}

export function browserLaunchSpec(
    url: string,
    platform: NodeJS.Platform = process.platform,
    environment: NodeJS.ProcessEnv = process.env
): BrowserLaunchSpec | null {
    if (platform === 'win32')
        return {
            command: path.join(
                environment.SystemRoot ?? 'C:\\Windows',
                'System32',
                'cmd.exe'
            ),
            args: ['/d', '/s', '/c', 'start', '', url]
        }
    if (platform === 'darwin')
        return {
            command: 'open',
            args: [url]
        }
    if (platform === 'linux')
        return {
            command: 'xdg-open',
            args: [url]
        }
    return null
}
