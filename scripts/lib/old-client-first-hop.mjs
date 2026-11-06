import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'

// Public, immutable input authority. Never a published future release or product switch.
export const FIRST_HOP_BASELINE = Object.freeze({ version: '0.5.0', sourceSha: 'bec7f9f31828e8c57e0a2c103b6b1206c22c37cf',
    zipSha256: '14b92b60660b6694e2c8c19a2c1da695127de8dfd0fbafd6bd36fc8b5bc3d2bf',
    desktopSha256: '3866280efae561b85a3b90f57636d53214fbbd64df9a59bbde63900dedc082da',
    helperSha256: '06825e73e99f78dabf7357a14a0fe4c77d32fd4e32a41e7505cac965e7430066' })
export const FIRST_HOP_SCENARIOS = Object.freeze(['success', 'hash-mismatch', 'health-rollback', 'launch-rollback'])
export const FIRST_HOP_FIXTURE_VERSION = '0.5.1'
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
export function assertDisposableWindowsCi(env = process.env, platform = process.platform) {
    assert.ok(platform === 'win32' && env.GITHUB_ACTIONS === 'true' && env.RUNNER_OS === 'Windows' && env.RUNNER_ENVIRONMENT === 'github-hosted', 'First-hop application execution requires separately authorized disposable GitHub-hosted Windows CI')
}
export function firstHopPublication(scenario) {
    assert.ok(FIRST_HOP_SCENARIOS.includes(scenario), 'Unknown first-hop scenario')
    // Health failure changes publisher metadata, not the candidate bytes or helper instruction.
    const version = scenario === 'health-rollback' ? '0.5.2' : FIRST_HOP_FIXTURE_VERSION
    const archiveName = `Pica-Library-v${version}-windows-x64.zip`, tag = 'v' + version
    const downloadRoot = `https://github.com/Saber-Alter-Lily/pica-library/releases/download/${tag}/`
    return { version, archiveName, latestApi: 'https://api.github.com/repos/Saber-Alter-Lily/pica-library/releases/latest',
        taggedApi: `https://api.github.com/repos/Saber-Alter-Lily/pica-library/releases/tags/${tag}`,
        archiveUrl: downloadRoot + archiveName, sumsUrl: downloadRoot + 'SHA256SUMS.txt',
        latestSumsUrl: 'https://github.com/Saber-Alter-Lily/pica-library/releases/latest/download/SHA256SUMS.txt',
        releaseUrl: `https://github.com/Saber-Alter-Lily/pica-library/releases/tag/${tag}` }
}
export function loopbackHost(value) {
    return ['127.0.0.1', 'localhost', '::1', '[::1]', '::ffff:127.0.0.1'].includes(String(value ?? '').toLowerCase())
}
export function localConnectTarget(value) {
    while (Array.isArray(value)) value = value[0]
    if (typeof value === 'string') return /^\\\\[.?]\\pipe\\/i.test(value)
    return Boolean(value && (typeof value.path === 'string' ? /^\\\\[.?]\\pipe\\/i.test(value.path) : loopbackHost(value.host ?? value.hostname)))
}

/** Inert publisher transport. Native fetch is used ONLY for actual loopback health/HTTP. */
export function createFirstHopFetch({ scenario, archiveBytes, releasedDesktop, nativeFetch, observe }) {
    const publication = firstHopPublication(scenario), expectedHash = sha256(archiveBytes)
    const response = (body, url, headers) => {
        const result = new Response(body, { status: 200, headers })
        Object.defineProperty(result, 'url', { value: url })
        return result
    }
    return async (input, init = {}) => {
        const url = new URL(input instanceof Request ? input.url : String(input))
        if (url.protocol === 'http:' && !url.username && !url.password && loopbackHost(url.hostname)) return nativeFetch(input, init)
        const headers = new Headers(input instanceof Request ? input.headers : undefined)
        new Headers(init.headers).forEach((value, key) => headers.set(key, value))
        const method = String(init.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
        if (!releasedDesktop() || method !== 'GET' || headers.has('authorization') || headers.has('cookie') || url.username || url.password) {
            observe({ kind: 'UNEXPECTED_EXTERNAL_REQUEST' }); throw Error('First-hop fixture blocked an unexpected external request')
        }
        if ([publication.latestApi, publication.taggedApi].includes(url.href)) {
            observe({ kind: 'SYNTHETIC_PUBLISHER', route: url.href === publication.latestApi ? 'latest-api' : 'tag-api' })
            return response(JSON.stringify({ tag_name: 'v' + publication.version, draft: false, prerelease: false, html_url: publication.releaseUrl,
                assets: [{ name: publication.archiveName, digest: 'sha256:' + expectedHash, browser_download_url: publication.archiveUrl }] }), url.href, { 'content-type': 'application/json' })
        }
        if ([publication.sumsUrl, publication.latestSumsUrl].includes(url.href)) {
            observe({ kind: 'SYNTHETIC_PUBLISHER', route: 'checksums' })
            return response(expectedHash + '  ' + publication.archiveName + '\n', publication.sumsUrl, { 'content-type': 'text/plain' })
        }
        if (url.href === publication.archiveUrl) {
            const served = Buffer.from(archiveBytes)
            if (scenario === 'hash-mismatch') { assert.ok(served.length); served[served.length - 1] ^= 1 }
            observe({ kind: 'SYNTHETIC_PUBLISHER', route: 'archive', bytes: served.length })
            return response(served, url.href, { 'content-type': 'application/zip', 'content-length': String(served.length) })
        }
        observe({ kind: 'UNEXPECTED_EXTERNAL_REQUEST' }); throw Error('First-hop fixture has no response for that external URL')
    }
}
