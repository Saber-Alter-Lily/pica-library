import fs from 'node:fs'
import path from 'node:path'
import {
    createHash, createPublicKey, randomUUID, verify,
    type KeyObject
} from 'node:crypto'
import {
    normalizeExternalReaderManifest
} from './reader-contract'
import {
    TrustedSourceProcess,
    type TrustedSourceWorker
} from './trusted-process'

/**
 * First S3 release-owned, single-file worker lifecycle. An unsigned ecosystem
 * pack is NOT an executable source package. The trusted app MUST pin the
 * Ed25519 publisher key outside the downloaded/supplied release.
 *
 * Explicitly a single-process, trusted-installation-root QA seam, not an OS
 * sandbox or a production-signed extension marketplace. No network installer,
 * arbitrary manifest entrypoints, multi-file dependencies or script hooks.
 */
export interface SignedSourceWorkerRelease {
    schemaVersion: 1
    sourceId: string
    version: string
    size: number
    sha256: string
    signature: string
}

export interface SourceWorkerState {
    schemaVersion: 1
    revision: number
    activeVersion: string | null
}

export interface SignedWorkerStoreOptions {
    /** Trusted app-owned root, not an untrusted source-controlled directory. */
    root: string
    /** Pinned publisher public key, provided by the application, not the release. */
    publisherPublicKeyPem: string
    requestTimeoutMs?: number
}

const VERSION = /^(0|[1-9]\d{0,3})\.(0|[1-9]\d{0,3})\.(0|[1-9]\d{0,3})$/
const SHA = /^[0-9a-f]{64}$/
const MAX_WORKER_BYTES = 1024 * 1024
const MAX_METADATA_BYTES = 4096
const signatureRe = /^[A-Za-z0-9+/]{86}==$/
const capabilities = { chapters: true, pages: true, media: true } as const

function object(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
function exact(value: Record<string, unknown>, keys: string[]) {
    return Object.keys(value).sort().join(',') === [...keys].sort().join(',')
}
function sourceId(id: string) {
    normalizeExternalReaderManifest({
        apiVersion: 1, id, capabilities
    })
    return id
}
function validVersion(version: string) {
    if (typeof version !== 'string' || !VERSION.test(version))
        throw new Error('Invalid signed worker version')
    return version
}
function digest(data: Uint8Array) {
    return createHash('sha256').update(data).digest('hex')
}

/** The exact bytes the trusted publisher signs. Never sign arbitrary JSON. */
export function sourceWorkerSignaturePayload(
    input: Pick<SignedSourceWorkerRelease,
        'sourceId' | 'version' | 'size' | 'sha256'>
): Buffer {
    sourceId(input.sourceId)
    validVersion(input.version)
    if (!Number.isSafeInteger(input.size) ||
        input.size < 1 || input.size > MAX_WORKER_BYTES ||
        typeof input.sha256 !== 'string' || !SHA.test(input.sha256))
        throw new Error('Invalid signed worker content digest')
    return Buffer.from(
        'pica-library:source-worker:v1\n' +
        [input.sourceId, input.version, String(input.size), input.sha256].join('\n') +
        '\n', 'utf8'
    )
}

function parseRelease(value: unknown, key: KeyObject): SignedSourceWorkerRelease {
    if (!object(value) || !exact(value, [
        'schemaVersion', 'sourceId', 'version', 'size', 'sha256', 'signature'
    ]) || value.schemaVersion !== 1 ||
        typeof value.signature !== 'string' ||
        value.signature.length !== 88 ||
        !signatureRe.test(value.signature))
        throw new Error('Invalid signed worker release')
    const release = value as unknown as SignedSourceWorkerRelease
    const payload = sourceWorkerSignaturePayload(release)
    const signature = Buffer.from(release.signature, 'base64')
    if (signature.length !== 64 ||
        signature.toString('base64') !== release.signature ||
        !verify(null, payload, key, signature))
        throw new Error('Signed worker publisher verification failed')
    return {
        schemaVersion: 1,
        sourceId: release.sourceId,
        version: release.version,
        size: release.size,
        sha256: release.sha256,
        signature: release.signature
    }
}

function parseState(value: unknown): SourceWorkerState {
    if (!object(value) || !exact(value, [
        'schemaVersion', 'revision', 'activeVersion'
    ]) || value.schemaVersion !== 1 ||
        !Number.isSafeInteger(value.revision) ||
        (value.revision as number) < 0 ||
        (value.activeVersion !== null &&
            (typeof value.activeVersion !== 'string' ||
                !VERSION.test(value.activeVersion))))
        throw new Error('Invalid source worker activation state')
    return {
        schemaVersion: 1,
        revision: value.revision as number,
        activeVersion: value.activeVersion as string | null
    }
}

function directory(location: string, create = false) {
    if (create) fs.mkdirSync(location, { recursive: true, mode: 0o700 })
    const info = fs.lstatSync(location)
    if (info.isSymbolicLink() || !info.isDirectory())
        throw new Error('Untrusted source worker directory')
    return location
}
function regularFile(location: string, maxBytes: number) {
    const stat = fs.lstatSync(location)
    if (stat.isSymbolicLink() || !stat.isFile() ||
        stat.nlink !== 1 || stat.size < 1 || stat.size > maxBytes)
        throw new Error('Invalid or linked source worker file')
    return fs.readFileSync(location)
}
function readJson(location: string): unknown {
    return JSON.parse(regularFile(location, MAX_METADATA_BYTES).toString('utf8'))
}
function durableWrite(location: string, bytes: Buffer, mode: number) {
    const descriptor = fs.openSync(location, 'wx', mode)
    try {
        fs.writeFileSync(descriptor, bytes)
        fs.fsyncSync(descriptor)
    } finally {
        fs.closeSync(descriptor)
    }
}

/** Atomic activation pointer replacement, with no shell or update scripts. */
function writeState(folder: string, state: SourceWorkerState) {
    const temporary = path.join(folder, '.active-' + randomUUID() + '.tmp')
    try {
        durableWrite(temporary, Buffer.from(JSON.stringify(state) + '\n'), 0o600)
        fs.renameSync(temporary, path.join(folder, 'active.json'))
    } finally {
        if (fs.existsSync(temporary)) fs.rmSync(temporary)
    }
}

export class SignedWorkerStore {
    private readonly root: string
    private readonly publisher: KeyObject
    private readonly active = new Map<string, TrustedSourceProcess>()
    private readonly starting = new Map<string, symbol>()

    constructor(private readonly options: SignedWorkerStoreOptions) {
        if (typeof options.root !== 'string' || !path.isAbsolute(options.root))
            throw new Error('Trusted source installation root must be absolute')
        if (typeof options.publisherPublicKeyPem !== 'string')
            throw new Error('Missing pinned publisher key')
        this.publisher = createPublicKey(options.publisherPublicKeyPem)
        if (this.publisher.asymmetricKeyType !== 'ed25519')
            throw new Error('Trusted worker publisher must use Ed25519')
        this.root = path.resolve(options.root)
        // Do not create or alter the application root just by constructing.
    }

    private sourceFolder(id: string, create = false) {
        sourceId(id)
        directory(this.root, create)
        return directory(path.join(this.root, id), create)
    }

    private versionsFolder(id: string, create = false) {
        return directory(path.join(this.sourceFolder(id, create), 'versions'), create)
    }

    private versionFolder(id: string, version: string) {
        return directory(path.join(this.versionsFolder(id), validVersion(version)))
    }

    /**
     * Install a signed, bounded, self-contained worker generation, but NEVER
     * automatically enable or run it. Immutable generations are not replaced.
     */
    install(rawRelease: unknown, suppliedBytes: Uint8Array) {
        const release = parseRelease(rawRelease, this.publisher)
        if (!(suppliedBytes instanceof Uint8Array) ||
            suppliedBytes.byteLength !== release.size ||
            digest(suppliedBytes) !== release.sha256)
            throw new Error('Signed worker payload does not match release')
        const parent = this.versionsFolder(release.sourceId, true)
        const destination = path.join(parent, release.version)
        // lstat detects even a dangling symlink; existsSync would treat it
        // as absent and could allow a hostile directory entry to be reused.
        if (fs.lstatSync(destination, { throwIfNoEntry: false })) {
            this.readInstalled(release.sourceId, release.version)
            const existing = readJson(path.join(destination, 'release.json'))
            if (JSON.stringify(existing) !== JSON.stringify(release))
                throw new Error('Installed worker version cannot be replaced')
            return { sourceId: release.sourceId, version: release.version, installed: false }
        }
        const stage = fs.mkdtempSync(path.join(parent, '.stage-'))
        try {
            durableWrite(path.join(stage, 'worker.cjs'),
                Buffer.from(suppliedBytes), 0o400)
            durableWrite(path.join(stage, 'release.json'),
                Buffer.from(JSON.stringify(release) + '\n'), 0o400)
            fs.renameSync(stage, destination)
        } finally {
            if (fs.existsSync(stage))
                fs.rmSync(stage, { recursive: true, force: true })
        }
        return { sourceId: release.sourceId, version: release.version, installed: true }
    }

    /** Revalidate signature, exact file inventory and payload on EVERY open. */
    readInstalled(id: string, version: string) {
        const folder = this.versionFolder(id, version)
        const inventory = fs.readdirSync(folder).sort()
        if (inventory.join(',') !== 'release.json,worker.cjs')
            throw new Error('Untrusted signed worker generation inventory')
        const release = parseRelease(readJson(path.join(folder, 'release.json')), this.publisher)
        if (release.sourceId !== id || release.version !== version)
            throw new Error('Installed worker identity does not match')
        const worker = regularFile(path.join(folder, 'worker.cjs'), MAX_WORKER_BYTES)
        if (worker.length !== release.size || digest(worker) !== release.sha256)
            throw new Error('Installed worker integrity check failed')
        return { release, folder, workerPath: path.join(folder, 'worker.cjs') }
    }

    state(id: string): SourceWorkerState {
        const folder = this.sourceFolder(id)
        const location = path.join(folder, 'active.json')
        // A broken activation symlink must fail closed, never look like a
        // fresh revision-zero state.
        return fs.lstatSync(location, { throwIfNoEntry: false })
            ? parseState(readJson(location))
            : { schemaVersion: 1, revision: 0, activeVersion: null }
    }

    /**
     * Single-process CAS revision gate. Caller must explicitly select a signed
     * generation; rollback uses this same verified route. This is NOT a
     * cross-process transactional lock or a health-check autopromotion.
     */
    activate(id: string, version: string, expectedRevision: number) {
        sourceId(id)
        validVersion(version)
        this.readInstalled(id, version)
        const previous = this.state(id)
        if (previous.revision !== expectedRevision)
            throw new Error('Source worker selection changed; refresh')
        if (previous.activeVersion === version)
            return previous
        this.stop(id)
        const next: SourceWorkerState = {
            schemaVersion: 1, revision: previous.revision + 1,
            activeVersion: version
        }
        writeState(this.sourceFolder(id), next)
        return next
    }

    disable(id: string, expectedRevision: number) {
        const previous = this.state(id)
        if (previous.revision !== expectedRevision)
            throw new Error('Source worker selection changed; refresh')
        if (previous.activeVersion === null) return previous
        this.stop(id)
        const next: SourceWorkerState = {
            schemaVersion: 1, revision: previous.revision + 1,
            activeVersion: null
        }
        writeState(this.sourceFolder(id), next)
        return next
    }

    rollback(id: string, earlierSignedVersion: string, expectedRevision: number) {
        return this.activate(id, earlierSignedVersion, expectedRevision)
    }

    stop(id: string) {
        sourceId(id)
        this.starting.delete(id)
        this.active.get(id)?.revoke()
        this.active.delete(id)
    }

    /** No implicit enabling/recovery, even when a previous worker crashed. */
    async openActive(id: string) {
        const state = this.state(id)
        if (!state.activeVersion) throw new Error('Source worker is not enabled')
        if (this.active.has(id) || this.starting.has(id))
            throw new Error('Source worker is already running or starting')
        const { release, folder, workerPath } =
            this.readInstalled(id, state.activeVersion)
        const ticket = Symbol('source-worker-start')
        this.starting.set(id, ticket)
        let process: TrustedSourceProcess | undefined
        try {
            const worker: TrustedSourceWorker = {
                workerRoot: folder,
                workerPath,
                expectedSha256: release.sha256,
                requestTimeoutMs: this.options.requestTimeoutMs
            }
            process = await TrustedSourceProcess.open({
                apiVersion: 1, id, capabilities
            }, worker)
            const current = this.state(id)
            if (this.starting.get(id) !== ticket ||
                current.revision !== state.revision ||
                current.activeVersion !== state.activeVersion)
                throw new Error('Source worker activation changed during startup')
            this.active.set(id, process)
            return process
        } catch (error) {
            process?.revoke()
            throw error
        } finally {
            if (this.starting.get(id) === ticket) this.starting.delete(id)
        }
    }

    close() {
        for (const id of new Set([...this.active.keys(), ...this.starting.keys()]))
            this.stop(id)
    }
}
