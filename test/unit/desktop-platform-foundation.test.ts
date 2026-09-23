import { describe, expect, it } from 'vitest'
import {
    browserLaunchSpec,
    defaultDesktopRoot,
    desktopPlatformCapabilities,
    desktopPlatformId
} from '../../src/desktop/platform'

describe('Desktop platform foundation', () => {
    it('maps supported Node platforms without claiming unsupported capabilities', () => {
        expect(desktopPlatformId('win32')).toBe('windows')
        expect(desktopPlatformId('darwin')).toBe('macos')
        expect(desktopPlatformId('linux')).toBe('linux')
        expect(desktopPlatformId('freebsd')).toBe('unsupported')

        expect(desktopPlatformCapabilities('win32', 'x64')).toMatchObject({
            id: 'windows',
            arch: 'x64',
            browserLaunch: true,
            secureCredentialPersistence: true,
            nativeFolderPicker: true,
            nativeSavePicker: true,
            managedEhWebLogin: true,
            selfUpdate: true
        })
        for (const platform of ['darwin', 'linux'] as const)
            expect(desktopPlatformCapabilities(platform, 'arm64')).toMatchObject({
                browserLaunch: true,
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
        expect(
            defaultDesktopRoot('darwin', {}, '/Users/test')
        ).toBe('/Users/test/Library/Application Support/Pica Library')
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

    it('uses each operating system default-browser launcher without a shell rewrite', () => {
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
        expect(browserLaunchSpec('https://example.test', 'freebsd')).toBeNull()
    })
})
