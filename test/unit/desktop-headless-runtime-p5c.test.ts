import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { desktopRuntimeOptions } from '../../src/desktop/runtime-mode'

describe('Desktop headless runtime foundation P5C', () => {
    it('keeps ordinary Desktop behavior interactive', () => {
        expect(desktopRuntimeOptions([])).toEqual({
            mode: 'interactive',
            openBrowser: true,
            idleBrowserShutdown: true,
            mobileBridge: true
        })
        expect(desktopRuntimeOptions(['--no-open'])).toEqual({
            mode: 'interactive',
            openBrowser: false,
            idleBrowserShutdown: true,
            mobileBridge: true
        })
    })

    it('makes headless a persistent no-GUI runtime with network bridge opt-in', () => {
        expect(desktopRuntimeOptions(['--headless'])).toEqual({
            mode: 'headless',
            openBrowser: false,
            idleBrowserShutdown: false,
            mobileBridge: false
        })
        expect(
            desktopRuntimeOptions(['--headless', '--mobile-bridge'])
        ).toEqual({
            mode: 'headless',
            openBrowser: false,
            idleBrowserShutdown: false,
            mobileBridge: true
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
            mobileBridge: true
        })
    })

    it('keeps the main Web service loopback-only while headless mode is still unauthenticated for remote Web use', () => {
        const main = fs.readFileSync('src/desktop/main.ts', 'utf8')
        expect(main).toContain("host: '127.0.0.1'")
        expect(main).not.toContain(
            "host: runtimeOptions.mode === 'headless' ? '0.0.0.0'"
        )
        expect(main).toContain('!runtimeOptions.idleBrowserShutdown')
        expect(main).toContain('scheduleBrowserCloseShutdown()')
        expect(main).toContain('if (runtimeOptions.mobileBridge)')
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

    it('keeps graceful cleanup but guarantees explicit shutdown cannot be held open by background handles', () => {
        const main = fs.readFileSync('src/desktop/main.ts', 'utf8')
        expect(main).toContain('await closeEngine()')
        expect(main).toContain('instance.release()')
        expect(main).toContain('process.exitCode = exitCode')
        expect(main).toContain(
            'const finalExit = setTimeout(() => process.exit(exitCode), 250)'
        )
        expect(main).toContain('finalExit.unref()')
        expect(main).toContain(
            'Shutdown: Desktop controller request received'
        )
        expect(main).toContain('void stop()')
        expect(main).not.toContain('setImmediate(() => void stop())')
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
