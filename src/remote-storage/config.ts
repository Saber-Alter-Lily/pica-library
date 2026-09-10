import fs from 'node:fs'
import path from 'node:path'
import type { RemoteStoragePublicConfig } from './types'

export function normalizeRemoteStorageConfig(input: Record<string, unknown>): RemoteStoragePublicConfig {
    const kind = String(input.kind ?? 'webdav')
    if (kind !== 'webdav') throw new Error('Only WebDAV is supported in Alpha7')
    const raw = String(input.baseUrl ?? '').trim()
    if (!raw) throw new Error('Enter the WebDAV server URL')
    const url = new URL(raw)
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('WebDAV URL must use HTTP or HTTPS')
    url.username = ''
    url.password = ''
    const root = String(input.root ?? 'PicaLibrary').trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
    if (!root) throw new Error('Enter the remote library root folder')
    return { kind: 'webdav', baseUrl: url.toString().replace(/\/$/, ''), root }
}

export function loadRemoteStorageConfig(file: string): RemoteStoragePublicConfig | null {
    if (!fs.existsSync(file)) return null
    return normalizeRemoteStorageConfig(JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>)
}

export function saveRemoteStorageConfig(file: string, value: RemoteStoragePublicConfig) {
    const serialized = JSON.stringify(value, null, 2)
    if (/password|authorization|cookie|token/i.test(serialized)) throw new Error('Refusing to persist remote storage secrets in plaintext')
    fs.mkdirSync(path.dirname(file), { recursive: true })
    const temporary = `${file}.tmp`
    fs.writeFileSync(temporary, serialized, { encoding: 'utf8', mode: 0o600 })
    fs.renameSync(temporary, file)
}
