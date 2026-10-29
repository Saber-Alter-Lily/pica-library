import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'

/**
 * Verify a disposable staged copy of ORIGINAL full Web UI before any request.
 * This loads only byte-verified, flat source-neutral static assets; no manifest
 * fields can authorize a source extension, filesystem traversal or URL fetch.
 */
export const FULL_WEB_QA_MANIFEST = 'full-web-qa-manifest.json'
export type FullWebStatic = ReadonlyMap<string, Readonly<{
    data: Buffer
    contentType: string
}>>

const kinds: Record<string, string> = {
    js: 'text/javascript; charset=utf-8',
    css: 'text/css; charset=utf-8',
    html: 'text/html; charset=utf-8',
    webp: 'image/webp',
    png: 'image/png',
    svg: 'image/svg+xml'
}
const denied = new Set([
    'eh-account.js', 'jm-account.js', 'source-choices.js',
    'source-hosts.js', 'saved-source-hosts.js', 'recommendation-v5.js',
    'onboarding-v1.js', 'alpha8-star-access.js',
    'alpha8-connections.js', 'alpha8-product.js',
    'alpha8-theme-help.js', 'alpha8-update-ui.js',
    'ecosystem-pack-v1.js',
    'offline-core-reader-qa.js', 'reader-fragment.html'
])
const hash = (data: Buffer) => createHash('sha256').update(data).digest('hex')
export function verifiedFullWebQaAssets(webRoot: string): FullWebStatic | null {
    const manifestPath = path.join(webRoot, FULL_WEB_QA_MANIFEST)
    if (!fs.existsSync(manifestPath)) return null
    const stat = fs.lstatSync(manifestPath)
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 ||
        stat.size > 32 * 1024 || stat.size < 1)
        throw new Error('Full Web QA asset manifest is unsafe')
    const raw: unknown = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
        throw new Error('Full Web QA manifest must be an object')
    const input = raw as Record<string, unknown>
    if (input.kind !== 'DISPOSABLE_FULL_WEB_CORE_QA_ONLY' ||
        input.sourceSdkIncluded !== false ||
        input.distributable !== false ||
        !Array.isArray(input.appEntrypoints) ||
        input.appEntrypoints.join(',') !==
            'info-tip-v1.js,app.js,alpha7-cloud.js,ui-polish-v5.js' ||
        !Array.isArray(input.files) || input.files.length < 20 ||
        input.files.length > 75)
        throw new Error('Unsupported full Web QA manifest')
    const entries = new Map<string, {data: Buffer; contentType: string}>()
    let total = 0
    for (const row of input.files) {
        if (!row || typeof row !== 'object' || Array.isArray(row))
            throw new Error('Malformed full Web QA asset')
        const record = row as Record<string, unknown>
        const name = record.name
        if (typeof name !== 'string' ||
            !/^[a-z0-9][a-z0-9_.-]*\.(?:js|css|webp|png|svg|html)$/.test(name) ||
            name.includes('..') || denied.has(name) || entries.has(name) ||
            !Number.isSafeInteger(record.size) ||
            (record.size as number) < 1 || (record.size as number) > 512 * 1024 ||
            typeof record.sha256 !== 'string' ||
            !/^[a-f0-9]{64}$/.test(record.sha256))
            throw new Error('Unapproved full Web QA asset')
        const file = path.join(webRoot, name)
        const stat = fs.lstatSync(file)
        if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 ||
            stat.size !== record.size)
            throw new Error('Full Web QA asset changed after staging')
        const bytes = fs.readFileSync(file)
        if (hash(bytes) !== record.sha256)
            throw new Error('Full Web QA SHA mismatch: ' + name)
        total += bytes.length
        if (total > 3 * 1024 * 1024)
            throw new Error('Full Web QA static asset budget exceeded')
        const ext = name.slice(name.lastIndexOf('.') + 1)
        entries.set(name, { data: bytes, contentType: kinds[ext] })
    }
    for (const required of [
        'index.html', 'app.js', 'alpha7-cloud.js', 'i18n.js',
        'styles.css', 'reader-settings.js', 'pica-library-icon.webp'
    ]) if (!entries.has(required))
        throw new Error('Original full Web UI is incomplete: ' + required)
    const html = entries.get('index.html')!.data.toString('utf8')
    for (const id of ['home', 'library', 'shelves', 'reader', 'settings'])
        if (!html.includes('id="' + id + '"'))
            throw new Error('Original full Web view is absent: ' + id)
    if (!html.includes('<script type="module" src="./app.js"></script>'))
        throw new Error('Original full Web entrypoint was replaced')
    return entries
}
