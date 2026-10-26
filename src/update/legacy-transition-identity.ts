import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { normalizeFullPackagePath, requiredFullApplicationFiles } from './full-archive'

/** Build-bound expected facts, never a user-loadable manifest. No ZIP/runtime/network dependency. */
export interface LegacyTransitionAuthority {
    formatVersion: 1
    kind: 'pica-library-legacy-transition'
    source: { version: '0.5.0'; sourceSha: string; files: Record<string, string> }
    target: {
        version: string; sourceSha: string; archiveName: string; archiveSha256: string
        channel: 'stable' | 'unpublished-review'; provenanceUrl: string
    }
}
export interface LegacyTransitionContext {
    authority: LegacyTransitionAuthority | null
    toolRoot: string
    localAppData: string
    platform: string
}
export class LegacyTransitionPreflightError extends Error {
    constructor(readonly code: string) { super(code); this.name = 'LegacyTransitionPreflightError' }
}
function refuse(code: string): never { throw new LegacyTransitionPreflightError(code) }
const sha256 = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex')

export function checkedLegacyTransitionAuthority(context: LegacyTransitionContext) {
    const value = context.authority
    if (!value) refuse('BUILD_AUTHORITY_NOT_BOUND')
    if (context.platform !== 'win32') refuse('WINDOWS_ONLY')
    if (value.formatVersion !== 1 || value.kind !== 'pica-library-legacy-transition' ||
        value.source?.version !== '0.5.0' || value.source.sourceSha !== 'bec7f9f31828e8c57e0a2c103b6b1206c22c37cf' ||
        !value.source.files || !value.target || !/^[a-f0-9]{40}$/.test(value.target.sourceSha) ||
        !/^[a-f0-9]{64}$/.test(value.target.archiveSha256) || !/^\d+\.\d+\.\d+$/.test(value.target.version) ||
        !/^[a-zA-Z0-9._ -]{1,160}\.zip$/.test(value.target.archiveName)) refuse('BUILD_AUTHORITY_INVALID')
    const parts = value.target.version.split('.').map(Number)
    if (!parts.every(Number.isSafeInteger) || !(parts[0] > 0 || parts[1] > 5 || parts[1] === 5 && parts[2] > 0))
        refuse('TARGET_MUST_ADVANCE_LEGACY_VERSION')
    const names = Object.keys(value.source.files)
    if (names.length < requiredFullApplicationFiles.length || names.length > 4096 ||
        requiredFullApplicationFiles.some(name => !names.includes(name))) refuse('SOURCE_IDENTITY_INVALID')
    for (const name of names)
        if (normalizeFullPackagePath(name) !== name || !/^[a-f0-9]{64}$/.test(value.source.files[name])) refuse('SOURCE_IDENTITY_INVALID')
    if (new Set(names.map(name => name.toLowerCase())).size !== names.length) refuse('SOURCE_IDENTITY_INVALID')
    const url = new URL(value.target.provenanceUrl)
    if (url.origin !== 'https://github.com' || url.username || url.password || url.search || url.hash) refuse('TARGET_PROVENANCE_INVALID')
    if (value.target.channel === 'stable') {
        if (url.pathname !== '/Saber-Alter-Lily/pica-library/releases/download/v' + value.target.version + '/' + value.target.archiveName)
            refuse('TARGET_PROVENANCE_INVALID')
    } else if (value.target.channel !== 'unpublished-review' ||
        !/^\/Saber-Alter-Lily\/pica-library\/actions\/runs\/[1-9]\d*\/artifacts\/[1-9]\d*$/.test(url.pathname)) refuse('TARGET_PROVENANCE_INVALID')
    return value
}

export function readLegacyRegularFile(root: string, relative: string, limit = 256 * 1024 * 1024) {
    let file = root
    const segments = normalizeFullPackagePath(relative).split('/')
    for (let i = 0; i < segments.length; i++) {
        file = path.join(file, segments[i])
        const stat = fs.lstatSync(file)
        if (stat.isSymbolicLink() || (i < segments.length - 1 ? !stat.isDirectory() : !stat.isFile())) refuse('LINK_OR_NONREGULAR_FILE')
        if (i === segments.length - 1 && (stat.nlink !== 1 || stat.size > limit)) refuse('FILE_IDENTITY_OR_SIZE_INVALID')
    }
    return fs.readFileSync(file)
}

export function legacyInstalledTreeIdentity(applicationRoot: string, authority: LegacyTransitionAuthority) {
    const marker = readLegacyRegularFile(applicationRoot, 'SOURCE_SHA.txt', 4096).toString('utf8').trim()
    if (marker !== authority.source.sourceSha) refuse('INSTALLED_SOURCE_MISMATCH')
    const expected = Object.keys(authority.source.files), found: string[] = []
    function walk(directory: string, prefix: string) {
        for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
            const name = prefix + entry.name
            if (entry.isSymbolicLink()) refuse('LINK_OR_NONREGULAR_FILE')
            if (entry.isDirectory()) {
                if (!expected.some(file => file.startsWith(name + '/'))) refuse('INSTALLED_UNEXPECTED_CONTENT')
                walk(path.join(directory, entry.name), name + '/')
            } else {
                if (!entry.isFile() || !Object.hasOwn(authority.source.files, name)) refuse('INSTALLED_UNEXPECTED_CONTENT')
                found.push(name)
            }
        }
    }
    walk(applicationRoot, '')
    if (found.length !== expected.length) refuse('INSTALLED_FILES_MISSING')
    for (const name of expected)
        if (sha256(readLegacyRegularFile(applicationRoot, name)) !== authority.source.files[name]) refuse('INSTALLED_FILE_MISMATCH')
    return sha256(JSON.stringify(expected.sort().map(name => [name, authority.source.files[name]])))
}
