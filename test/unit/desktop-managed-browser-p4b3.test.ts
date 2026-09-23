import { describe, expect, it } from 'vitest'
import {
    discoverManagedBrowser,
    managedBrowserCandidates
} from '../../src/desktop/managed-browser'

function result(status: number | null, stdout = '') {
    return {
        pid: 1,
        output: [null, stdout, ''],
        stdout,
        stderr: '',
        status,
        signal: null
    } as never
}

describe('Desktop managed browser discovery P4B-3', () => {
    it('prefers an explicit browser path override on every supported platform', () => {
        const override = '/opt/pica-browser'
        for (const platform of ['win32', 'darwin', 'linux'] as const) {
            const found = discoverManagedBrowser(platform, {
                environment: { PICA_LIBRARY_BROWSER_PATH: override },
                fileExists: (file) => file === override,
                runner: (() => result(1)) as never
            })
            expect(found?.executable).toBe(override)
        }
    })

    it('discovers the existing Windows Edge path before Chrome', () => {
        const environment = {
            'ProgramFiles(x86)': 'C:\\Program Files (x86)',
            ProgramFiles: 'C:\\Program Files',
            LOCALAPPDATA: 'C:\\Users\\Test\\AppData\\Local'
        }
        const candidates = managedBrowserCandidates(
            'win32',
            environment,
            'C:\\Users\\Test'
        )
        const edge = candidates.find((item) =>
            item.endsWith('Microsoft\\Edge\\Application\\msedge.exe')
        )!
        const chrome = candidates.find((item) =>
            item.endsWith('Google\\Chrome\\Application\\chrome.exe')
        )!
        const found = discoverManagedBrowser('win32', {
            environment,
            home: 'C:\\Users\\Test',
            fileExists: (file) => file === edge || file === chrome,
            runner: (() => result(1)) as never
        })
        expect(found).toMatchObject({
            kind: 'edge',
            label: 'Microsoft Edge',
            executable: edge
        })
    })

    it('discovers macOS Edge, Chrome and Chromium app executables', () => {
        const candidates = managedBrowserCandidates(
            'darwin',
            {},
            '/Users/test'
        )
        expect(candidates).toContain(
            '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
        )
        expect(candidates).toContain(
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
        )
        expect(candidates).toContain(
            '/Applications/Chromium.app/Contents/MacOS/Chromium'
        )
        const chromium =
            '/Applications/Chromium.app/Contents/MacOS/Chromium'
        expect(
            discoverManagedBrowser('darwin', {
                home: '/Users/test',
                fileExists: (file) => file === chromium,
                runner: (() => result(1)) as never
            })
        ).toMatchObject({
            kind: 'chromium',
            label: 'Chromium',
            executable: chromium
        })
    })

    it('discovers common Linux browser binaries and can fall back to PATH lookup', () => {
        expect(
            discoverManagedBrowser('linux', {
                fileExists: (file) => file === '/usr/bin/google-chrome-stable',
                runner: (() => result(1)) as never
            })
        ).toMatchObject({
            kind: 'chrome',
            executable: '/usr/bin/google-chrome-stable'
        })

        const pathBrowser = '/opt/bin/chromium'
        const found = discoverManagedBrowser('linux', {
            fileExists: (file) => file === pathBrowser,
            runner: ((command: string, args: readonly string[]) => {
                if (
                    command === '/usr/bin/which' &&
                    args[0] === 'chromium'
                )
                    return result(0, pathBrowser + '\n')
                return result(1)
            }) as never
        })
        expect(found).toMatchObject({
            kind: 'chromium',
            executable: pathBrowser
        })
    })

    it('returns null instead of inventing browser support', () => {
        expect(
            discoverManagedBrowser('linux', {
                fileExists: () => false,
                runner: (() => result(1)) as never
            })
        ).toBeNull()
        expect(
            discoverManagedBrowser('freebsd', {
                fileExists: () => false,
                runner: (() => result(1)) as never
            })
        ).toBeNull()
    })
})
