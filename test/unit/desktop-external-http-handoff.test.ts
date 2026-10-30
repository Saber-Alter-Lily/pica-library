/**
 * CORE-LIB-04c-02c-02b-01: actual distinct Mobile Bridge + Remote API
 * listener admission into the ORIGINAL Desktop update handoff fence.
 * No existing profile, credentials, real external host or user data.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LibraryDatabase } from '../../src/library/database'
import { LibraryService } from '../../src/library/service'
import { startMobileBridge } from '../../src/mobile/bridge-server'
import { startRemoteApiGateway } from '../../src/remote-api/gateway'
import { DesktopHttpHandoffFence } from '../../src/desktop/update-http-fence'
import { enabledFixtureSources } from '../helpers/source-runtime-fixture'

const callbacks: Array<() => void | Promise<void>> = []
afterEach(async () => {
    vi.restoreAllMocks()
    for (const callback of callbacks.splice(0).reverse()) {
        await callback()
    }
})
function syntheticRoot() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(),
        'pica-external-handoff-qa-'))
    callbacks.push(() => {
        const actual = fs.realpathSync.native(root)
        const temp = fs.realpathSync.native(os.tmpdir())
        if (path.dirname(actual) !== temp ||
            !/^pica-external-handoff-qa-[a-z0-9_-]+$/i.test(
                path.basename(actual)))
            throw new Error('INVALID_SYNTHETIC_CLEANUP_OWNER')
        fs.rmSync(root, { recursive: true, force: true })
    })
    return root
}
function externalIngress(gate: DesktopHttpHandoffFence) {
    return {
        enter: (method: string, pathname: string) =>
            gate.enter(method, pathname, false)
    }
}
function responseStatus(url: string, payload: string) {
    let request!: http.ClientRequest
    const response = new Promise<number>((resolve, reject) => {
        request = http.request(url, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'content-length': String(Buffer.byteLength(payload))
            }
        }, (res) => {
            res.resume()
            res.once('end', () => resolve(res.statusCode ?? 0))
            res.once('error', reject)
        })
        request.on('error', reject)
    })
    return { request, response }
}

describe('actual Mobile Bridge and Remote API share original Desktop update handoff', () => {
    it('counts partially uploaded Mobile pairing, blocks freeze, denies all phone ingress while frozen, restores pairing', async () => {
        const root = syntheticRoot()
        // MobileBridge's existing personalization service normally owns the
        // selected Desktop home; redirect it to THIS ephemeral fixture only.
        const beforeHome = process.env.PICA_LIBRARY_DESKTOP_HOME
        process.env.PICA_LIBRARY_DESKTOP_HOME = root
        callbacks.push(() => {
            if (beforeHome === undefined)
                delete process.env.PICA_LIBRARY_DESKTOP_HOME
            else process.env.PICA_LIBRARY_DESKTOP_HOME = beforeHome
        })
        const db = new LibraryDatabase(path.join(root, 'library.db'))
        callbacks.push(() => db.close())
        const service = new LibraryService(db, root, undefined, undefined,
            undefined, enabledFixtureSources())
        const fence = new DesktopHttpHandoffFence()
        const bridge = await startMobileBridge({
            database: db, service, host: '127.0.0.1', port: 0,
            stateFile: path.join(root, 'paired-synthetic-devices.json'),
            requestAdmission: externalIngress(fence)
        })
        callbacks.push(async () => bridge.close())
        const base = bridge.status().addresses[0]
        expect((await fetch(base + '/mobile/v1/status')).status).toBe(200)
        const packet = JSON.stringify({
            code: bridge.status().pairingCode,
            deviceId: 'synthetic-android',
            deviceName: 'QA Phone'
        })
        const inFlight = responseStatus(base + '/mobile/v1/pair', packet)
        const split = Math.min(10, packet.length - 1)
        inFlight.request.write(packet.slice(0, split))
        try {
            await vi.waitFor(() => expect(fence.pendingRequests).toBe(1),
                { timeout: 4_000, interval: 25 })
            expect(() => fence.freezeForHandoff())
                .toThrow('Finish active Reader and library requests')
        } finally {
            inFlight.request.end(packet.slice(split))
        }
        expect(await inFlight.response).toBe(200)
        expect(bridge.status().pairedDevices).toHaveLength(1)
        expect(fence.pendingRequests).toBe(0)

        const undo = fence.freezeForHandoff()
        try {
            expect(fence.enter('GET', '/api/v1/desktop/status', false)).toBeNull()
            expect(fence.enter('POST', '/api/v1/update/apply', false)).toBeNull()
            for (const url of [
                '/mobile/v1/status', '/mobile/v1/library',
                '/mobile/v1/accounts/status'
            ]) {
                const blocked = await fetch(base + url)
                expect(blocked.status).toBe(503)
                expect(blocked.headers.get('retry-after')).toBe('2')
                expect(blocked.headers.get('connection')).toBe('close')
                const body = await blocked.json() as Record<string, unknown>
                expect(body.code).toBe('DESKTOP_UPDATE_HANDOFF_FROZEN')
            }
            const deniedPair = await fetch(base + '/mobile/v1/pair', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: packet
            })
            expect(deniedPair.status).toBe(503)
            expect(bridge.status().pairedDevices).toHaveLength(1)
            expect(fence.pendingRequests).toBe(0)
        } finally { undo() }
        expect((await fetch(base + '/mobile/v1/status')).status).toBe(200)
        expect(fence.frozen).toBe(false)
    })

    it('counts an in-flight actual authenticated Remote API proxy request; blocks health and proxy while frozen', async () => {
        const root = syntheticRoot()
        const fence = new DesktopHttpHandoffFence()
        const ingress = externalIngress(fence)
        let targets = 0
        let releaseTarget!: () => void
        const allowTarget = new Promise<void>(resolve => {
            releaseTarget = resolve
        })
        const upstream = http.createServer(async (_req, res) => {
            targets++
            await allowTarget
            res.writeHead(200, { 'content-type': 'application/json' })
            res.end(JSON.stringify({ synthetic: true }))
        })
        await new Promise<void>((resolve, reject) => {
            upstream.once('error', reject)
            upstream.listen(0, '127.0.0.1', resolve)
        })
        callbacks.push(async () => {
            upstream.closeAllConnections()
            await new Promise<void>(resolve => upstream.close(() => resolve()))
        })
        const targetAddress = upstream.address()
        if (!targetAddress || typeof targetAddress === 'string')
            throw new Error('SYNTHETIC_UPSTREAM_ADDRESS_UNAVAILABLE')
        const targetUrl = 'http://127.0.0.1:' + targetAddress.port
        const token = 's'.repeat(48)
        const gateway = await startRemoteApiGateway({
            targetBaseUrl: targetUrl, host: '127.0.0.1', port: 0,
            token, allowedHosts: ['127.0.0.1'],
            requestAdmission: ingress
        })
        callbacks.push(async () => gateway.close())
        const url = 'http://127.0.0.1:' + gateway.port
        const headers = { authorization: 'Bearer ' + token }
        const pending = fetch(url + '/api/v1/capabilities', { headers })
        try {
            await vi.waitFor(() => expect(targets).toBe(1),
                { timeout: 5_000, interval: 25 })
            expect(fence.pendingRequests).toBe(1)
            expect(() => fence.freezeForHandoff())
                .toThrow('Finish active Reader and library requests')
        } finally { releaseTarget() }
        expect((await pending).status).toBe(200)
        await vi.waitFor(() => expect(fence.pendingRequests).toBe(0),
            { timeout: 2_000 })
        expect(targets).toBe(1)

        const undo = fence.freezeForHandoff()
        try {
            for (const route of ['/api/v1/capabilities', '/healthz',
                '/remote/v1/session/bootstrap', '/remote/']) {
                const blocked = await fetch(url + route, { headers })
                expect(blocked.status).toBe(503)
                expect((await blocked.json()).code)
                    .toBe('DESKTOP_UPDATE_HANDOFF_FROZEN')
            }
            expect(targets).toBe(1)
        } finally { undo() }
        const restored = await fetch(url + '/api/v1/capabilities', { headers })
        expect(restored.status).toBe(200)
        expect(targets).toBe(2)
    })

    it('wires both actual Desktop listener startups to the SAME shared fence with no control exception', () => {
        const desktop = fs.readFileSync('src/desktop/main.ts', 'utf8')
        expect(desktop).toContain('const externalUpdateIngress = {')
        expect(desktop).toContain('updateHttpFence.enter(method, pathname, false)')
        expect(desktop.split('requestAdmission: externalUpdateIngress').length - 1)
            .toBe(2)
        expect(desktop).toContain("if (mobileBridgeSettingsBusy) leases.push('mobile-bridge-settings')")
        const mobile = fs.readFileSync('src/mobile/bridge-server.ts', 'utf8')
        const gateway = fs.readFileSync('src/remote-api/gateway.ts', 'utf8')
        expect(mobile).toContain('options.requestAdmission?.enter(')
        expect(gateway).toContain('options.requestAdmission?.enter(')
        for (const module of [mobile, gateway]) {
            expect(module).toContain('DESKTOP_UPDATE_HANDOFF_FROZEN')
        }
    })
})
