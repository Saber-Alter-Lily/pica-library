import { build } from 'esbuild'
import { describe, expect, it, vi } from 'vitest'
import { OnlineReaderService } from '../../src/services/online-reader-service'
import {
    assertExternalPageOwner,
    externalPageLocator,
    MAX_EXTERNAL_MEDIA_BYTES,
    normalizeExternalReaderManifest,
    type ExternalReaderTransport
} from '../../src/source-extensions/reader-contract'
import { bindExternalReader } from '../../src/source-extensions/desktop-reader-adapter'

const manifest = {
    apiVersion: 1,
    id: 'demo',
    capabilities: { chapters: true, pages: true, media: true }
}
const png = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4
])

function fixture() {
    const state = new Map<string, unknown>()
    const images = new Map<string, {
        data: Buffer
        contentType: string
        fingerprint?: string
    }>()
    let active = true
    let revision = 'epoch-one'
    const transport: ExternalReaderTransport = {
        episodes: vi.fn(async () => [
            { id: 'chapter-1', title: 'One', order: 1 }
        ]),
        pages: vi.fn(async () => [{ key: 'p1' }, { key: 'p2' }]),
        media: vi.fn(async () => ({ bytes: png, contentType: 'image/png' }))
    }
    const { source, contract } = bindExternalReader(manifest, transport, {
        assertEnabled() {
            if (!active) throw new Error('Source disabled')
        },
        revision() { return revision }
    })
    const readerState = {
        getAppState<T>(key: string): T | undefined {
            return state.get(key) as T | undefined
        },
        setAppState(key: string, value: unknown) { state.set(key, value) }
    }
    const cache = {
        get(key: string, fingerprint?: string) {
            const record = images.get(key)
            return record?.fingerprint === fingerprint
                ? { data: record.data, contentType: record.contentType }
                : null
        },
        put(key: string, data: Buffer, contentType: string, fingerprint?: string) {
            images.set(key, { data, contentType, fingerprint })
        }
    }
    const reader = new OnlineReaderService(readerState, source, cache, contract)
    return {
        reader, source, transport, images, state,
        revoke() { active = false },
        enable() { active = true },
        setRevision(value: string) { revision = value }
    }
}

describe('S2 external reader contract and real core port', () => {
    it('reads chapters/pages/image and saves progress without a provider SDK, account, or Host', async () => {
        const { reader, transport, state } = fixture()
        expect(await reader.chapters('demo:work-1')).toEqual([{
            id: 'chapter-1', title: 'One', order: 1, source: 'provider'
        }])
        const chapter = await reader.chapter('demo:work-1', 'chapter-1')
        expect(chapter.pages).toHaveLength(2)
        expect(JSON.stringify(chapter)).not.toContain('source-page:')
        expect(JSON.stringify(chapter)).not.toContain('http')
        expect(transport.media).not.toHaveBeenCalled()

        const first = await reader.picture('demo:work-1', 'chapter-1', 0)
        expect(first).toMatchObject({ contentType: 'image/png' })
        expect(first.data.equals(Buffer.from(png))).toBe(true)
        await reader.picture('demo:work-1', 'chapter-1', 0)
        expect(transport.media).toHaveBeenCalledTimes(1)
        expect(transport.media).toHaveBeenCalledWith('demo:work-1', 'p1')

        await reader.saveProgress('demo:work-1', 'chapter-1', 1)
        expect(reader.recentProgress()[0]).toMatchObject({
            comicId: 'demo:work-1', episodeId: 'chapter-1', pageIndex: 1
        })
        expect(state.has('online-reader-progress-v1')).toBe(true)
    })

    it('rejects cross-work media and arbitrary HTTP locators without touching transport', async () => {
        const { reader, source, transport } = fixture()
        await expect(reader.chapters('other:work-1')).rejects.toThrow(
            'Comic does not belong to this source'
        )
        expect(() => source.assertPageOwnedByComic?.(
            'demo:work-1', externalPageLocator('demo', 'demo:work-2', 'p1')
        )).toThrow('Page source does not match comic source')
        expect(() => source.assertPageOwnedByComic?.(
            'demo:work-1', 'https://example.org/image.png'
        )).toThrow('Page source does not match comic source')
        expect(() => assertExternalPageOwner(
            'demo', 'demo:work-1', 'source-page:demo:demo%3Awork-1:../escape'
        )).toThrow('Invalid source page token')
        await expect(source.fetchPage('https://example.org')).rejects.toThrow(
            'require source and work ownership'
        )
        expect(transport.media).not.toHaveBeenCalled()
    })

    it('checks revocation before a cache hit and changes cache ownership with epoch', async () => {
        const f = fixture()
        await f.reader.picture('demo:work-1', 'chapter-1', 0)
        expect(f.transport.media).toHaveBeenCalledTimes(1)
        f.revoke()
        await expect(f.reader.picture('demo:work-1', 'chapter-1', 0))
            .rejects.toThrow('Source disabled')
        expect(f.transport.media).toHaveBeenCalledTimes(1)
        f.enable()
        f.setRevision('epoch-two')
        await f.reader.picture('demo:work-1', 'chapter-1', 0)
        expect(f.transport.media).toHaveBeenCalledTimes(2)
    })

    it('rejects a late page response after the source is revoked', async () => {
        const f = fixture()
        let resolveMedia: (value: { bytes: Uint8Array; contentType: string }) => void =
            () => { throw new Error('media promise was not requested') }
        f.transport.media = vi.fn(() => new Promise((resolve) => { resolveMedia = resolve }))
        const pending = f.reader.picture('demo:work-1', 'chapter-1', 0)
        await vi.waitFor(() => expect(f.transport.media).toHaveBeenCalledTimes(1))
        f.revoke()
        resolveMedia({ bytes: png, contentType: 'image/png' })
        await expect(pending).rejects.toThrow('Source disabled')
        expect(f.images.size).toBe(0)
    })

    it('fails closed on unknown routes, executable manifest fields and malformed DTOs', async () => {
        expect(() => normalizeExternalReaderManifest({
            ...manifest, entrypoint: 'https://bad.example/extension.js'
        })).toThrow('Invalid or unsupported')
        expect(() => normalizeExternalReaderManifest({
            ...manifest, id: 'pica'
        })).toThrow('Invalid or unsupported')
        expect(() => normalizeExternalReaderManifest({
            ...manifest, apiVersion: 2
        })).toThrow('Invalid or unsupported')

        const f = fixture()
        f.transport.pages = vi.fn(async () => [{ key: 'https://bad.example' }])
        await expect(f.reader.chapter('demo:work-1', 'chapter-1'))
            .rejects.toThrow('Invalid external page token')
        expect(f.transport.media).not.toHaveBeenCalled()
    })

    it('rejects untrusted MIME, oversized responses and duplicate chapter/page keys', async () => {
        const f = fixture()
        f.transport.media = vi.fn(async () => ({
            bytes: png, contentType: 'image/svg+xml'
        }))
        await expect(f.reader.picture('demo:work-1', 'chapter-1', 0))
            .rejects.toThrow('Invalid external reader media payload')
        f.transport.media = vi.fn(async () => ({
            bytes: new Uint8Array(MAX_EXTERNAL_MEDIA_BYTES + 1),
            contentType: 'image/png'
        }))
        await expect(f.reader.picture('demo:work-1', 'chapter-1', 0))
            .rejects.toThrow('Invalid external reader media payload')
        f.transport.pages = vi.fn(async () => [{ key: 'dup' }, { key: 'dup' }])
        f.setRevision('epoch-new')
        await expect(f.reader.chapter('demo:work-1', 'chapter-1'))
            .rejects.toThrow('Invalid external page token')
    })

    it('builds the trusted desktop binding from only two adapter files, not concrete source SDKs', async () => {
        const result = await build({
            entryPoints: ['src/source-extensions/desktop-reader-adapter.ts'],
            bundle: true, platform: 'node', format: 'esm',
            write: false, metafile: true, logLevel: 'silent'
        })
        expect(Object.keys(result.metafile!.inputs).map((p) =>
            p.replaceAll('\\', '/')).sort()).toEqual([
            'src/source-extensions/desktop-reader-adapter.ts',
            'src/source-extensions/reader-contract.ts'
        ])
    })
})
