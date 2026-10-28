import { fork, type ChildProcess } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import {
    externalComicIdentity,
    externalEpisodeIdentity,
    externalPageLocator,
    normalizeExternalReaderManifest,
    validateExternalEpisodes,
    validateExternalMedia,
    validateExternalPages,
    MAX_EXTERNAL_MEDIA_BYTES,
    type ExternalReaderAccess,
    type ExternalReaderEpisode,
    type ExternalReaderManifest,
    type ExternalReaderMedia,
    type ExternalReaderPage,
    type ExternalReaderTransport
} from './reader-contract'

/**
 * Experimental Windows/Node process boundary.
 *
 * The application must pin one trusted, bundled worker SHA-256 and supply its
 * location. This code never discovers, downloads, installs or evaluates a
 * source module. Running a process under the user's OS identity is NOT an OS
 * sandbox; true code-signing and process permissions remain a release gate.
 */
export interface TrustedSourceWorker {
    workerRoot: string
    workerPath: string
    expectedSha256: string
    requestTimeoutMs?: number
}

type Operation = 'hello' | 'episodes' | 'pages' | 'media'
interface Request {
    version: 1
    session: string
    id: number
    operation: Operation
    comicId?: string
    episodeId?: string
    pageKey?: string
}
interface Pending {
    resolve(value: unknown): void
    reject(reason: Error): void
    timer: NodeJS.Timeout
}

const MAX_WORKER_BYTES = 1024 * 1024
const MAX_IPC_RESPONSE_BYTES = Math.ceil(MAX_EXTERNAL_MEDIA_BYTES / 3) * 4 + 4096
const MAX_REQUEST_BYTES = 4096
const MAX_OUTSTANDING = 4
const HEX_SHA = /^[0-9a-f]{64}$/i

function record(input: unknown): input is Record<string, unknown> {
    return Boolean(input) && typeof input === 'object' && !Array.isArray(input)
}

function trustedFile(config: TrustedSourceWorker) {
    if (typeof config.workerPath !== 'string' ||
        typeof config.workerRoot !== 'string' ||
        !path.isAbsolute(config.workerPath) ||
        !path.isAbsolute(config.workerRoot) ||
        typeof config.expectedSha256 !== 'string' ||
        !HEX_SHA.test(config.expectedSha256))
        throw new Error('Trusted source worker must use an absolute pinned path')
    // Resolve and reject symlinked entry points. The process still requires an
    // immutable, trusted installation root in a later production integration.
    if (fs.lstatSync(config.workerPath).isSymbolicLink())
        throw new Error('Trusted worker must not be a symbolic link')
    const root = fs.realpathSync(config.workerRoot)
    const file = fs.realpathSync(config.workerPath)
    const rel = path.relative(root, file)
    if (!rel || rel.startsWith('..' + path.sep) || rel === '..' ||
        path.isAbsolute(rel) || path.extname(file).toLowerCase() !== '.cjs')
        throw new Error('Trusted worker escaped its approved root')
    const stat = fs.statSync(file)
    if (!stat.isFile() || stat.size <= 0 || stat.size > MAX_WORKER_BYTES)
        throw new Error('Trusted worker is missing or too large')
    const actual = createHash('sha256').update(fs.readFileSync(file)).digest('hex')
    if (actual !== config.expectedSha256.toLowerCase())
        throw new Error('Trusted source worker hash mismatch')
    return { root, file }
}

function validateMediaResponse(value: unknown): ExternalReaderMedia {
    if (!record(value) ||
        Object.keys(value).sort().join(',') !== 'base64,contentType' ||
        typeof value.base64 !== 'string' ||
        typeof value.contentType !== 'string' ||
        !value.base64.length ||
        value.base64.length > MAX_IPC_RESPONSE_BYTES ||
        value.base64.length % 4 !== 0 ||
        !/^[A-Za-z0-9+/]+={0,2}$/.test(value.base64))
        throw new Error('Invalid source worker media response')
    const bytes = Buffer.from(value.base64, 'base64')
    if (bytes.toString('base64') !== value.base64)
        throw new Error('Invalid source worker media encoding')
    return validateExternalMedia({ bytes, contentType: value.contentType })
}

export class TrustedSourceProcess implements ExternalReaderTransport, ExternalReaderAccess {
    private child: ChildProcess | null = null
    private readonly session = randomBytes(16).toString('hex')
    private readonly manifest: ExternalReaderManifest
    private readonly pending = new Map<number, Pending>()
    private sequence = 0
    private ready = false
    private revoked = false
    private readonly timeoutMs: number

    private constructor(rawManifest: unknown, private readonly worker: TrustedSourceWorker) {
        this.manifest = normalizeExternalReaderManifest(rawManifest)
        const timeout = worker.requestTimeoutMs ?? 4000
        if (!Number.isSafeInteger(timeout) || timeout < 100 ||
            timeout > 15000)
            throw new Error('Invalid trusted worker timeout')
        this.timeoutMs = timeout
    }

    static async open(rawManifest: unknown, worker: TrustedSourceWorker) {
        const runtime = new TrustedSourceProcess(rawManifest, worker)
        await runtime.launch()
        return runtime
    }

    /** Revisions are per-process and never reused on recovery or re-enable. */
    revision() { return this.session }

    assertEnabled(): void {
        if (this.revoked || !this.ready || !this.child?.connected)
            throw new Error('Source process is disabled')
    }

    private async launch() {
        const { root, file } = trustedFile(this.worker)
        const env: NodeJS.ProcessEnv = {}
        if (process.platform === 'win32' && process.env.SystemRoot)
            env.SystemRoot = process.env.SystemRoot
        // Node's built-in IPC channel is used instead of inventing a wire
        // stream parser. No shell, inherited NODE_OPTIONS or PICA_* secrets.
        const child = fork(file, [], {
            cwd: root,
            execPath: process.execPath,
            execArgv: [],
            env,
            stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
            detached: false
        })
        this.child = child
        child.on('message', (message: unknown) => this.receive(message))
        child.once('error', () => this.fail(new Error('Source worker process failed')))
        child.once('exit', () => this.fail(new Error('Source worker exited')))
        child.once('disconnect', () => this.fail(new Error('Source worker disconnected')))
        try {
            const response = await this.sendRequest('hello', {})
            if (!record(response) || Object.keys(response).sort().join(',') !==
                'apiVersion,sourceId' ||
                response.apiVersion !== 1 ||
                response.sourceId !== this.manifest.id)
                throw new Error('Source worker handshake rejected')
            this.ready = true
        } catch (error) {
            this.fail(new Error('Trusted source handshake failed'))
            throw error
        }
    }

    private receive(message: unknown) {
        if (this.revoked) return
        if (!record(message) ||
            message.version !== 1 ||
            message.session !== this.session ||
            !Number.isSafeInteger(message.id) ||
            (message as Record<string, unknown>).id === undefined ||
            typeof message.ok !== 'boolean') {
            this.fail(new Error('Invalid source worker message'))
            return
        }
        const id = Number(message.id)
        const entry = this.pending.get(id)
        if (!entry) {
            this.fail(new Error('Unsolicited source worker reply'))
            return
        }
        this.pending.delete(id)
        clearTimeout(entry.timer)
        try {
            // Check size after Node IPC decoding. This bounds accepted data,
            // but is not a defense against a malicious worker exhausting OS
            // memory; trusted/signed workers remain mandatory.
            const wireBytes = Buffer.byteLength(JSON.stringify(message), 'utf8')
            if (wireBytes > MAX_IPC_RESPONSE_BYTES)
                throw new Error('Source worker response exceeds limit')
            if (message.ok) {
                if (Object.keys(message).sort().join(',') !==
                    'data,id,ok,session,version')
                    throw new Error('Malformed source worker response')
                entry.resolve(message.data)
            } else {
                if (Object.keys(message).sort().join(',') !==
                    'error,id,ok,session,version' ||
                    typeof message.error !== 'string' ||
                    message.error.length > 200)
                    throw new Error('Malformed source worker error')
                entry.reject(new Error('Source worker rejected request'))
            }
        } catch {
            entry.reject(new Error('Malformed source worker response'))
            this.fail(new Error('Source worker protocol failure'))
        }
    }

    private sendRequest(operation: Operation, params: Partial<Request>) {
        if (this.revoked || !this.child?.connected ||
            (operation !== 'hello' && !this.ready))
            return Promise.reject(new Error('Source process is disabled'))
        if (this.pending.size >= MAX_OUTSTANDING)
            return Promise.reject(new Error('Too many source worker requests'))
        const id = ++this.sequence
        const packet: Request = {
            version: 1,
            session: this.session,
            id,
            operation,
            ...params
        }
        if (Buffer.byteLength(JSON.stringify(packet)) > MAX_REQUEST_BYTES)
            return Promise.reject(new Error('Source worker request exceeds limit'))
        return new Promise<unknown>((resolve, reject) => {
            const timer = setTimeout(() => {
                this.fail(new Error('Source worker request timed out'))
            }, this.timeoutMs)
            this.pending.set(id, { resolve, reject, timer })
            this.child!.send(packet, (error) => {
                if (error) this.fail(new Error('Source worker IPC send failed'))
            })
        })
    }

    async episodes(comicId: string): Promise<ExternalReaderEpisode[]> {
        this.assertEnabled()
        externalComicIdentity(this.manifest.id, comicId)
        const response = await this.sendRequest('episodes', { comicId })
        this.assertEnabled()
        return validateExternalEpisodes(response)
    }

    async pages(comicId: string, episodeId: string): Promise<ExternalReaderPage[]> {
        this.assertEnabled()
        externalComicIdentity(this.manifest.id, comicId)
        externalEpisodeIdentity(episodeId)
        const response = await this.sendRequest('pages', { comicId, episodeId })
        this.assertEnabled()
        return validateExternalPages(response)
    }

    async media(comicId: string, pageKey: string): Promise<ExternalReaderMedia> {
        this.assertEnabled()
        // Reuse the same opaque per-work token validation as the Reader port.
        externalPageLocator(this.manifest.id, comicId, pageKey)
        const response = await this.sendRequest('media', { comicId, pageKey })
        this.assertEnabled()
        return validateMediaResponse(response)
    }

    /** Revocation is immediate for cache and all pending requests. */
    revoke() { this.fail(new Error('Source process is disabled')) }
    close() { this.revoke() }

    private fail(reason: Error) {
        if (this.revoked) return
        this.revoked = true
        this.ready = false
        for (const pending of this.pending.values()) {
            clearTimeout(pending.timer)
            pending.reject(reason)
        }
        this.pending.clear()
        const child = this.child
        this.child = null
        if (child && !child.killed) child.kill()
    }
}
