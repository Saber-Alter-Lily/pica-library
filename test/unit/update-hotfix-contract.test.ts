import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { applicationFetchInternals } from '../../src/update/application-fetch'
import { UpdateManager } from '../../src/update/manager'

const roots: string[] = []
function manager(version = '0.3.5') {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-update-hotfix-'))
    roots.push(root)
    return new UpdateManager({
        currentVersion: version,
        applicationRoot: root,
        stateRoot: path.join(root, 'state'),
        launcherPath: path.join(root, 'Pica Library.exe'),
        runtimePath: process.execPath,
        desktopEntryPath: path.join(root, 'app', 'desktop.js'),
        instanceFile: path.join(root, 'instance.json')
    })
}

afterEach(() => {
    delete process.env.PICA_PROXY
    for (const root of roots.splice(0))
        fs.rmSync(root, { recursive: true, force: true })
})

describe('v0.3.5 update hotfix contracts', () => {
    it('parses the existing authenticated HTTP proxy without changing schemes', () => {
        expect(
            applicationFetchInternals.configuredProxy(
                'http://alice:secret@127.0.0.1:7890'
            )
        ).toEqual({
            protocol: 'http',
            host: '127.0.0.1',
            port: 7890,
            auth: { username: 'alice', password: 'secret' }
        })
    })

    it('always bypasses the application proxy for loopback health traffic', () => {
        expect(applicationFetchInternals.loopback('http://127.0.0.1:4789/api')).toBe(true)
        expect(applicationFetchInternals.loopback('http://localhost:4789/api')).toBe(true)
        expect(applicationFetchInternals.loopback('https://api.github.com/repos/x/y')).toBe(false)
    })

    it('does not resurrect a completed update after the target version has started', () => {
        const value = manager('0.3.5')
        fs.writeFileSync(
            value.progressFile,
            JSON.stringify({
                phase: 'complete',
                targetVersion: '0.3.5',
                updatedAt: '2026-09-10T00:00:00.000Z'
            })
        )
        expect(value.progress()).toMatchObject({ phase: 'idle' })
    })

    it('keeps the browser reload guard that notices a restarted newer backend', () => {
        const ui = fs.readFileSync('web/alpha8-update-ui.js', 'utf8')
        expect(ui).toContain("request('/api/v1/desktop/status')")
        expect(ui).toContain('version !== observedBackendVersion')
        expect(ui).toContain('location.reload()')
        expect(ui).toContain('p.error || p.message')
    })
})
