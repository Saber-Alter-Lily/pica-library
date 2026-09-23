import { describe, expect, it } from 'vitest'
import { findManagedBrowser } from '../../src/desktop/managed-browser'

function result(
    status: number | null,
    stdout = '',
    stderr = '',
    error?: Error
) {
    return {
        pid: 1,
        output: [null, stdout, stderr],
        stdout,
        stderr,
        status,
        signal: null,
        error
    } as never
}

describe('managed Chromium browser discovery P4C', () => {
    it('preserves Windows Edge-first discovery from known install roots', () => {
        const found = findManagedBrowser({
            platform: 'win32',
            environment: {
                ProgramFiles: 'C:\\Program Files',
                LOCALAPPDATA: 'C:\\Users\\Test\\AppData\\Local'
            },
            fileExists: (file) =>
                file ===
                'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
            runner: (() => result(1)) as never
        })
        expect(found).toEqual({
            kind: 'edge',
            displayName: 'Microsoft Edge',
            executable:
                'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
        })
    })

    it('discovers macOS Chrome, Edge or Chromium from native app locations', () => {
        const found = findManagedBrowser({
            platform: 'darwin',
            home: '/Users/test',
            environment: {},
            fileExists: (file) =>
                file ===
                '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            runner: (() => result(1)) as never
        })
        expect(found).toEqual({
            kind: 'chrome',
            displayName: 'Google Chrome',
            executable:
                '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
        })
    })

    it('discovers Linux browsers without passing PICA secrets to the probe', () => {
        const calls: Array<{
            command: string
            args: readonly string[]
            env: NodeJS.ProcessEnv
        }> = []
        const found = findManagedBrowser({
            platform: 'linux',
            environment: {
                PATH: '/usr/bin',
                PICA_ACCOUNT: 'secret-account',
                PICA_TOKEN: 'secret-token'
            },
            fileExists: () => false,
            runner: ((command: string, args: readonly string[], options: { env: NodeJS.ProcessEnv }) => {
                calls.push({ command, args, env: options.env })
                if (command === 'chromium')
                    return result(0, 'Chromium 140')
                return result(
                    null,
                    '',
                    '',
                    Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
                )
            }) as never
        })
        expect(found).toEqual({
            kind: 'chromium',
            displayName: 'Chromium',
            executable: 'chromium'
        })
        expect(calls.map((call) => call.command)).toEqual([
            'google-chrome',
            'google-chrome-stable',
            'chromium'
        ])
        for (const call of calls) {
            expect(call.args).toEqual(['--version'])
            expect(call.env.PICA_ACCOUNT).toBeUndefined()
            expect(call.env.PICA_TOKEN).toBeUndefined()
            expect(call.env.PATH).toBe('/usr/bin')
        }
    })

    it('returns null instead of advertising managed login when no browser is available', () => {
        expect(
            findManagedBrowser({
                platform: 'linux',
                environment: {},
                fileExists: () => false,
                runner: (() =>
                    result(
                        null,
                        '',
                        '',
                        Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
                    )) as never
            })
        ).toBeNull()
        expect(
            findManagedBrowser({
                platform: 'freebsd',
                environment: {},
                fileExists: () => false,
                runner: (() => result(0)) as never
            })
        ).toBeNull()
    })
})
