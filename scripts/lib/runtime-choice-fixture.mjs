import assert from 'node:assert/strict'
import { loopbackHost, sha256 } from './old-client-first-hop.mjs'

// Synthetic publisher metadata only. Never reserve/publish this version or enable a product bypass.
export const RUNTIME_CHOICE_FIXTURE_VERSION = '0.5.1'
export const RUNTIME_CHOICE_SCENARIOS = Object.freeze(['roundtrip', 'guardrails', 'request-abort', 'hash-mismatch', 'health-rollback', 'launch-rollback'])
const repository = 'Saber-Alter-Lily/pica-library'
export function runtimeChoicePublication(archives) {
    assert.deepEqual(Object.keys(archives).sort(), ['core', 'jm'])
    const version = RUNTIME_CHOICE_FIXTURE_VERSION, root = `https://github.com/${repository}/releases/download/v${version}/`
    const assets = ['core', 'jm'].map(mode => {
        assert.ok(Buffer.isBuffer(archives[mode]) && archives[mode].length > 0)
        const name = `Pica-Library-v${version}${mode === 'jm' ? '-with-jm' : ''}-windows-x64.zip`
        return { mode, name, browser_download_url: root + name, digest: 'sha256:' + sha256(archives[mode]), size: archives[mode].length }
    })
    return { version, latestApi: `https://api.github.com/repos/${repository}/releases/latest`,
        taggedApi: `https://api.github.com/repos/${repository}/releases/tags/v${version}`,
        sumsUrl: root + 'SHA256SUMS.txt', latestSumsUrl: `https://github.com/${repository}/releases/latest/download/SHA256SUMS.txt`, assets }
}

/** External CI transport: real loopback HTTP, inert exact official-publisher responses, no external fallback. */
export function createRuntimeChoiceFetch({ archives, scenario, nativeFetch, observe }) {
    assert.ok(RUNTIME_CHOICE_SCENARIOS.includes(scenario))
    const publication = runtimeChoicePublication(archives)
    const response = (body, url, headers) => { const value = new Response(body, { status: 200, headers }); Object.defineProperty(value, 'url', { value: url }); return value }
    return async (input, init = {}) => {
        const url = new URL(input instanceof Request ? input.url : String(input))
        if (url.protocol === 'http:' && !url.username && !url.password && loopbackHost(url.hostname)) return nativeFetch(input, init)
        const headers = new Headers(input instanceof Request ? input.headers : undefined)
        new Headers(init.headers).forEach((value, key) => headers.set(key, value))
        const method = String(init.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
        if (method !== 'GET' || headers.has('authorization') || headers.has('cookie') || url.username || url.password || url.hash) {
            observe({ kind: 'UNEXPECTED_PUBLISHER_REQUEST' }); throw Error('Runtime-choice fixture refuses external request')
        }
        const signal = init.signal ?? (input instanceof Request ? input.signal : undefined)
        if (signal?.aborted) throw new DOMException('Synthetic request already aborted', 'AbortError')
        if ([publication.latestApi, publication.taggedApi].includes(url.href)) {
            observe({ kind: 'SYNTHETIC_PUBLISHER', route: url.href === publication.latestApi ? 'latest-api' : 'tag-api' })
            return response(JSON.stringify({ tag_name: 'v' + publication.version, draft: false, prerelease: false,
                assets: publication.assets.map(({ mode, ...asset }) => asset) }), url.href, { 'content-type': 'application/json' })
        }
        if ([publication.sumsUrl, publication.latestSumsUrl].includes(url.href)) {
            observe({ kind: 'SYNTHETIC_PUBLISHER', route: 'checksums' })
            return response(publication.assets.map(asset => asset.digest.slice(7) + '  ' + asset.name).join('\n') + '\n', publication.sumsUrl, { 'content-type': 'text/plain' })
        }
        const asset = publication.assets.find(asset => asset.browser_download_url === url.href)
        if (!asset) { observe({ kind: 'UNEXPECTED_PUBLISHER_REQUEST' }); throw Error('Runtime-choice fixture has no external URL response') }
        const bytes = Buffer.from(archives[asset.mode])
        if (scenario === 'hash-mismatch') bytes[bytes.length - 1] ^= 1
        observe({ kind: 'SYNTHETIC_PUBLISHER', route: 'archive', mode: asset.mode, bytes: bytes.length })
        if (scenario !== 'request-abort') return response(bytes, url.href, { 'content-type': 'application/zip', 'content-length': String(bytes.length) })
        // Slow only the test publisher's byte stream. Product read/abort/deadline policy stays untouched.
        let timer, controller, offset = 0, ended = false
        const finish = kind => {
            if (ended) return
            ended = true; clearTimeout(timer); signal?.removeEventListener('abort', aborted)
            observe({ kind, mode: asset.mode, emittedBytes: offset })
        }
        const aborted = () => { if (!ended) { finish('SYNTHETIC_ARCHIVE_ABORTED'); controller.error(new DOMException('Synthetic archive aborted', 'AbortError')) } }
        const stream = new ReadableStream({
            start(value) {
                controller = value
                signal?.addEventListener('abort', aborted, { once: true })
                if (signal?.aborted) { aborted(); return }
                const emit = () => {
                    if (ended) return
                    if (offset === bytes.length) { finish('SYNTHETIC_ARCHIVE_COMPLETE'); controller.close(); return }
                    const next = Math.min(bytes.length, offset + 4096); controller.enqueue(bytes.subarray(offset, next)); offset = next
                    if (offset <= 4096) observe({ kind: 'SYNTHETIC_ARCHIVE_FIRST_CHUNK', mode: asset.mode, emittedBytes: offset })
                    timer = setTimeout(emit, 50)
                }
                timer = setTimeout(emit, 50)
            },
            cancel() { finish('SYNTHETIC_ARCHIVE_CANCELLED') }
        })
        return response(stream, url.href, { 'content-type': 'application/zip', 'content-length': String(bytes.length) })
    }
}
