import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { desktopRuntimeOptions } from '../../src/desktop/runtime-mode'

describe('Desktop headless runtime foundation P5C', () => {
    it('keeps ordinary Desktop behavior interactive', () => {
        expect(desktopRuntimeOptions([])).toEqual({
            mode: 'interactive',
            openBrowser: true,
            idleBrowserShutdown: true,
            mobileBridge: true,
            remoteApi: false
        })
        expect(desktopRuntimeOptions(['--no-open'])).toEqual({
            mode: 'interactive',
            openBrowser: false,
            idleBrowserShutdown: true,
            mobileBridge: true,
            remoteApi: false
        })
    })

    it('makes headless a persistent no-GUI runtime with network bridge opt-in', () => {
        expect(desktopRuntimeOptions(['--headless'])).toEqual({
            mode: 'headless',
            openBrowser: false,
            idleBrowserShutdown: false,
            mobileBridge: false,
            remoteApi: false
        })
        expect(
            desktopRuntimeOptions(['--headless', '--mobile-bridge'])
        ).toEqual({
            mode: 'headless',
            openBrowser: false,
            idleBrowserShutdown: false,
            mobileBridge: true,
            remoteApi: false
        })
        expect(
            desktopRuntimeOptions([
                '--headless',
                '--no-open',
                '--mobile-bridge'
            ])
        ).toEqual({
            mode: 'headless',
            openBrowser: false,
            idleBrowserShutdown: false,
            mobileBridge: true,
            remoteApi: false
        })
        expect(
            desktopRuntimeOptions(['--headless', '--remote-api'])
        ).toEqual({
            mode: 'headless',
            openBrowser: false,
            idleBrowserShutdown: false,
            mobileBridge: false,
            remoteApi: true
        })
        expect(desktopRuntimeOptions(['--remote-api']).remoteApi).toBe(false)
    })

    it('keeps the main Web service loopback-only and remote access behind the separate authenticated gateway', () => {
        const main = fs.readFileSync('src/desktop/main.ts', 'utf8')
        expect(main).toContain("host: '127.0.0.1'")
        expect(main).not.toContain(
            "host: runtimeOptions.mode === 'headless' ? '0.0.0.0'"
        )
        expect(main).toContain('!runtimeOptions.idleBrowserShutdown')
        expect(main).toContain('scheduleBrowserCloseShutdown()')
        expect(main).toContain('if (runtimeOptions.mobileBridge)')
        expect(main).toContain('remoteApiConfiguration(runtimeOptions.remoteApi)')
        expect(main).toContain('startRemoteApiGateway({')
        expect(main).toContain('readRemoteApiToken(remoteApiSettings.tokenFile)')
        expect(main).toContain('Shutdown: closing Remote API gateway')
        expect(main).toContain(
            "Mobile Bridge disabled in headless mode; pass --mobile-bridge to enable it"
        )
        expect(main).toContain('runtime: runtimeOptions')
        expect(main).toContain(
            "runtimeOptions.mode === 'headless' || process.platform !== 'win32'"
        )
        expect(main).toContain(
            "!runtimeOptions.openBrowser || config?.openBrowser === false"
        )
    })

    it('keeps graceful cleanup globally bounded and fault-isolated', () => {
        const main = fs.readFileSync('src/desktop/main.ts', 'utf8')
        expect(main).toContain('const SHUTDOWN_HARD_DEADLINE_MS = 35_000')
        expect(main).toContain('const SHUTDOWN_FINAL_HANDLE_GRACE_MS = 250')
        expect(main).toContain('async function shutdownStep(')
        expect(main).toContain('const hardExit = setTimeout(() => {')
        expect(main).toContain('await closeEngine()')
        expect(main).toContain('releaseInstanceLock(errors)')
        expect(main).toContain('clearTimeout(hardExit)')
        expect(main).toContain('SHUTDOWN_FINAL_HANDLE_GRACE_MS')
        expect(main).toContain('finalExit.unref()')
        expect(main).toContain(
            'Shutdown: Desktop controller request received'
        )
        expect(main).toContain('void stop()')
        expect(main).not.toContain('setImmediate(() => void stop())')

        const hardDeadline = main.indexOf('const hardExit = setTimeout(() => {')
        const gracefulClose = main.indexOf('errors.push(...(await closeEngine()))')
        expect(hardDeadline).toBeGreaterThan(-1)
        expect(gracefulClose).toBeGreaterThan(hardDeadline)
    })

    it('does not treat headless mode as a formal remote-server or release capability', () => {
        const platform = fs.readFileSync('src/desktop/platform.ts', 'utf8')
        const server = fs.readFileSync('src/library/server.ts', 'utf8')
        expect(platform).toContain("const productionWindows = windows && arch === 'x64'")
        expect(platform).toContain('distributionReady: productionWindows')
        expect(platform).toContain('selfUpdate: productionWindows')
        expect(server).toContain(
            'Unauthenticated remote binding is disabled. Configure an authenticated remote-access mode before using a non-loopback host.'
        )
        expect(server).not.toContain(
            "process.env.PICA_LIBRARY_ALLOW_REMOTE !== 'true'"
        )
    })
})
