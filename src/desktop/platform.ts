import os from 'node:os'
import path from 'node:path'

export type DesktopPlatformId = 'windows' | 'macos' | 'linux' | 'unsupported'

export interface DesktopPlatformCapabilities {
    id: DesktopPlatformId
    arch: string
    runtimeFoundation: boolean
    distributionReady: boolean
    browserLaunch: boolean
    directoryLaunch: boolean
    secureCredentialPersistence: boolean
    nativeFolderPicker: boolean
    nativeSavePicker: boolean
    managedEhWebLogin: boolean
    selfUpdate: boolean
}

export interface DesktopLaunchSpec {
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
    const runtimeFoundation = id !== 'unsupported'
    const windows = id === 'windows'
    const windowsX64 = windows && arch === 'x64'
    return {
        id,
        arch,
        runtimeFoundation,
        // Only Windows x64 has a production package/update chain today.
        // Windows arm64, macOS and Linux remain explicit foundation targets
        // until their package/update release gates are accepted.
        distributionReady: windowsX64,
        browserLaunch: runtimeFoundation,
        directoryLaunch: runtimeFoundation,
        secureCredentialPersistence: windows,
        nativeFolderPicker: windows,
        nativeSavePicker: windows,
        managedEhWebLogin: windows,
        selfUpdate: windowsX64
    }
}

export function defaultDesktopRoot(
    platform: NodeJS.Platform = process.platform,
    environment: NodeJS.ProcessEnv = process.env,
    home = os.homedir()
) {
    if (platform === 'win32')
        return path.win32.join(
            environment.LOCALAPPDATA ??
                path.win32.join(home, 'AppData', 'Local'),
            'Pica Library'
        )
    if (platform === 'darwin')
        return path.join(
            home,
            'Library',
            'Application Support',
            'Pica Library'
        )
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
): DesktopLaunchSpec | null {
    if (platform === 'win32')
        return {
            command: path.win32.join(
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

export function directoryLaunchSpec(
    directory: string,
    platform: NodeJS.Platform = process.platform,
    environment: NodeJS.ProcessEnv = process.env
): DesktopLaunchSpec | null {
    if (platform === 'win32')
        return {
            command: path.win32.join(
                environment.SystemRoot ?? 'C:\\Windows',
                'explorer.exe'
            ),
            args: [directory]
        }
    if (platform === 'darwin')
        return {
            command: 'open',
            args: [directory]
        }
    if (platform === 'linux')
        return {
            command: 'xdg-open',
            args: [directory]
        }
    return null
}
