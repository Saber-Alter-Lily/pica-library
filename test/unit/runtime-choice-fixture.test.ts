import { describe, expect, it, vi } from 'vitest'
import { createRuntimeChoiceFetch, RUNTIME_CHOICE_SCENARIOS, runtimeChoicePublication } from '../../scripts/lib/runtime-choice-fixture.mjs'
import { sha256 } from '../../scripts/lib/old-client-first-hop.mjs'

const archives = { core: Buffer.from('synthetic core bytes'), jm: Buffer.alloc(16384, 7) }
function fixture(scenario = 'roundtrip') {
    const rows: Record<string, unknown>[] = [], nativeFetch = vi.fn(async () => new Response('actual loopback port stub'))
    return { rows, nativeFetch, request: createRuntimeChoiceFetch({ archives, scenario, nativeFetch, observe: row => rows.push(row) }) }
}
describe('runtime-choice synthetic publisher; no application, Java, network or listener', () => {
    it('publishes exactly the two complete applications from shared version authority', async () => {
        const publication = runtimeChoicePublication(archives), f = fixture()
        expect(RUNTIME_CHOICE_SCENARIOS).toHaveLength(6)
        const metadata = await (await f.request(publication.latestApi)).json()
        expect(metadata.tag_name).toBe('v0.5.1'); expect(metadata.prerelease).toBe(false)
        expect(metadata.assets).toHaveLength(2)
        for (const asset of publication.assets) {
            expect(asset.name).toBe(`Pica-Library-v0.5.1${asset.mode === 'jm' ? '-with-jm' : ''}-windows-x64.zip`)
            expect(asset.digest).toBe('sha256:' + sha256(archives[asset.mode]))
            expect(Buffer.from(await (await f.request(asset.browser_download_url)).arrayBuffer())).toEqual(archives[asset.mode])
        }
        const sums = await f.request(publication.latestSumsUrl)
        expect(sums.url).toBe(publication.sumsUrl)
        for (const asset of publication.assets) expect(await sums.clone().text()).toContain(asset.digest.slice(7) + '  ' + asset.name)
        expect(f.nativeFetch).not.toHaveBeenCalled()
    })
    it.each([
        ['https://github.com/other/repo/releases/latest', {}],
        ['https://api.github.com/repos/Saber-Alter-Lily/pica-library/releases/latest?bypass=1', {}],
        ['https://api.github.com/repos/Saber-Alter-Lily/pica-library/releases/latest', { method: 'POST' }],
        ['https://api.github.com/repos/Saber-Alter-Lily/pica-library/releases/latest', { headers: { authorization: 'SYNTHETIC_PRIVATE' } }],
        ['https://api.github.com/repos/Saber-Alter-Lily/pica-library/releases/latest', { headers: { cookie: 'SYNTHETIC_PRIVATE' } }],
        ['http://127.0.0.1.attacker.invalid/', {}]
    ] as const)('fails closed without leaking request details: %s', async (url, options) => {
        const f = fixture()
        await expect(f.request(url, options)).rejects.toThrow(/external/)
        expect(f.nativeFetch).not.toHaveBeenCalled(); expect(JSON.stringify(f.rows)).not.toContain('SYNTHETIC_PRIVATE')
    })
    it('uses real transport only for explicit loopback URLs', async () => {
        const f = fixture()
        expect(await (await f.request('http://127.0.0.1:4789/api/v1/capabilities')).text()).toBe('actual loopback port stub')
        expect(f.nativeFetch).toHaveBeenCalledOnce()
    })
    it('changes only delivered bytes for hash rejection, not published checksums or source inputs', async () => {
        const f = fixture('hash-mismatch'), p = runtimeChoicePublication(archives), source = Buffer.from(archives.jm)
        const metadata = await (await f.request(p.latestApi)).json()
        const delivered = Buffer.from(await (await f.request(p.assets[1].browser_download_url)).arrayBuffer())
        expect(delivered).not.toEqual(source); expect(archives.jm).toEqual(source)
        expect(metadata.assets[1].digest).toBe('sha256:' + sha256(source))
    })
    it('propagates live cancellation through a partial archive stream and disposes its timer', async () => {
        const f = fixture('request-abort'), p = runtimeChoicePublication(archives), abort = new AbortController()
        const response = await f.request(p.assets[1].browser_download_url, { signal: abort.signal }), reader = response.body!.getReader()
        expect((await reader.read()).value?.length).toBe(4096)
        abort.abort()
        await expect(reader.read()).rejects.toMatchObject({ name: 'AbortError' })
        expect(f.rows.filter(row => row.kind === 'SYNTHETIC_ARCHIVE_ABORTED')).toEqual([{ kind: 'SYNTHETIC_ARCHIVE_ABORTED', mode: 'jm', emittedBytes: 4096 }])
        expect(f.rows.some(row => row.kind === 'SYNTHETIC_ARCHIVE_COMPLETE')).toBe(false)
    })
    it('rejects already-aborted work before archive delivery', async () => {
        const f = fixture('request-abort'), abort = new AbortController(); abort.abort()
        await expect(f.request(runtimeChoicePublication(archives).assets[0].browser_download_url, { signal: abort.signal })).rejects.toMatchObject({ name: 'AbortError' })
        expect(f.rows).toEqual([])
    })
    it('stops the byte producer on consumer cancellation without claiming a complete download', async () => {
        const f = fixture('request-abort'), publication = runtimeChoicePublication(archives)
        const response = await f.request(publication.assets[1].browser_download_url), reader = response.body!.getReader()
        await reader.read(); await reader.cancel()
        expect(f.rows.filter(row => row.kind === 'SYNTHETIC_ARCHIVE_FIRST_CHUNK')).toHaveLength(1)
        expect(f.rows.filter(row => row.kind === 'SYNTHETIC_ARCHIVE_CANCELLED')).toEqual([{ kind: 'SYNTHETIC_ARCHIVE_CANCELLED', mode: 'jm', emittedBytes: 4096 }])
        expect(f.rows.some(row => row.kind === 'SYNTHETIC_ARCHIVE_COMPLETE')).toBe(false)
    })
    it('closes an un-aborted stream normally without subsequently recording a cancellation', async () => {
        const f = fixture('request-abort'), publication = runtimeChoicePublication(archives)
        expect(Buffer.from(await (await f.request(publication.assets[1].browser_download_url)).arrayBuffer())).toEqual(archives.jm)
        expect(f.rows.filter(row => row.kind === 'SYNTHETIC_ARCHIVE_COMPLETE')).toEqual([{ kind: 'SYNTHETIC_ARCHIVE_COMPLETE', mode: 'jm', emittedBytes: archives.jm.length }])
        expect(f.rows.some(row => /ABORTED|CANCELLED/.test(String(row.kind)))).toBe(false)
    })
})
