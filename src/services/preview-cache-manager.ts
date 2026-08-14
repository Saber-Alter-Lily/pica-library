import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'

export interface PreviewCacheOptions {
    maxBytes?: number
    ttlMs?: number
    now?: () => number
}

interface PreviewMetadata {
    key: string
    contentType: string
    size: number
    createdAt: number
    accessedAt: number
}

export class PreviewCacheManager {
    static readonly defaultMaxBytes = 512 * 1024 * 1024
    static readonly defaultTtlMs = 7 * 24 * 60 * 60 * 1000
    readonly maxBytes: number
    readonly ttlMs: number
    private readonly now: () => number

    constructor(
        readonly root: string,
        options: PreviewCacheOptions = {}
    ) {
        this.maxBytes = options.maxBytes ?? PreviewCacheManager.defaultMaxBytes
        this.ttlMs = options.ttlMs ?? PreviewCacheManager.defaultTtlMs
        this.now = options.now ?? Date.now
        fs.mkdirSync(root, { recursive: true })
    }

    private id(key: string) {
        return createHash('sha256').update(key).digest('hex')
    }

    private files(key: string) {
        const id = this.id(key)
        return {
            data: path.join(this.root, `${id}.bin`),
            metadata: path.join(this.root, `${id}.json`)
        }
    }

    private metadataFiles() {
        return fs
            .readdirSync(this.root, { withFileTypes: true })
            .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
            .map((entry) => path.join(this.root, entry.name))
    }

    private readMetadata(file: string): PreviewMetadata | null {
        try {
            const value = JSON.parse(
                fs.readFileSync(file, 'utf8')
            ) as PreviewMetadata
            if (
                !value.key ||
                !value.contentType.startsWith('image/') ||
                !Number.isSafeInteger(value.size)
            )
                return null
            return value
        } catch {
            return null
        }
    }

    get(key: string) {
        const files = this.files(key)
        const metadata = this.readMetadata(files.metadata)
        if (!metadata || !fs.existsSync(files.data)) return null
        if (this.now() - metadata.accessedAt > this.ttlMs) {
            fs.rmSync(files.data, { force: true })
            fs.rmSync(files.metadata, { force: true })
            return null
        }
        metadata.accessedAt = this.now()
        fs.writeFileSync(files.metadata, JSON.stringify(metadata), 'utf8')
        return {
            data: fs.readFileSync(files.data),
            contentType: metadata.contentType,
            cached: true
        }
    }

    put(key: string, data: Buffer, contentType: string) {
        if (!contentType.startsWith('image/'))
            throw new Error('Preview cache accepts image content only')
        if (data.byteLength > this.maxBytes)
            throw new Error('Preview page exceeds the entire cache limit')
        const files = this.files(key)
        const timestamp = this.now()
        const metadata: PreviewMetadata = {
            key,
            contentType,
            size: data.byteLength,
            createdAt: timestamp,
            accessedAt: timestamp
        }
        fs.writeFileSync(`${files.data}.part`, data)
        fs.writeFileSync(
            `${files.metadata}.part`,
            JSON.stringify(metadata),
            'utf8'
        )
        fs.renameSync(`${files.data}.part`, files.data)
        fs.renameSync(`${files.metadata}.part`, files.metadata)
        this.evict()
        return { data, contentType, cached: false }
    }

    evict() {
        const now = this.now()
        const entries = this.metadataFiles().flatMap((file) => {
            const metadata = this.readMetadata(file)
            if (!metadata) {
                fs.rmSync(file, { force: true })
                return []
            }
            const files = this.files(metadata.key)
            if (
                !fs.existsSync(files.data) ||
                now - metadata.accessedAt > this.ttlMs
            ) {
                fs.rmSync(files.data, { force: true })
                fs.rmSync(files.metadata, { force: true })
                return []
            }
            return [{ metadata, files }]
        })
        let total = entries.reduce((sum, entry) => sum + entry.metadata.size, 0)
        for (const entry of entries.sort(
            (a, b) => a.metadata.accessedAt - b.metadata.accessedAt
        )) {
            if (total <= this.maxBytes) break
            fs.rmSync(entry.files.data, { force: true })
            fs.rmSync(entry.files.metadata, { force: true })
            total -= entry.metadata.size
        }
        return total
    }

    stats() {
        const bytes = this.evict()
        return { bytes, maxBytes: this.maxBytes, ttlMs: this.ttlMs }
    }

    clear() {
        let removed = 0
        for (const entry of fs.readdirSync(this.root, {
            withFileTypes: true
        })) {
            if (
                !entry.isFile() ||
                !/^[0-9a-f]{64}\.(?:bin|json)$/.test(entry.name)
            )
                continue
            fs.rmSync(path.join(this.root, entry.name), { force: true })
            removed += 1
        }
        return { removed, bytes: 0, maxBytes: this.maxBytes, ttlMs: this.ttlMs }
    }
}
