import fs from 'node:fs'
import path from 'node:path'
import { constants } from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'
import { crc32, inflateRawSync } from 'node:zlib'
import AdmZip from 'adm-zip'
import {
    localInventoryKey,
    type LocalInventoryV1,
    type LocalInventoryStore,
    type LocalPageV1 as Page,
    type LocalImportKind as Kind
} from './types'
export { localInventoryKey, type LocalInventoryV1 } from './types'

export const LOCAL_IMPORT_LIMITS = Object.freeze({
    archiveBytes: 256 * 1024 * 1024,
    pageBytes: 20 * 1024 * 1024,
    totalBytes: 512 * 1024 * 1024,
    pages: 2000,
    entries: 10000,
    depth: 8,
    previewTtlMs: 10 * 60 * 1000
})
interface Snapshot {
    source: string
    kind: Kind
    title: string
    comicId: string
    revision: string
    pages: Page[]
}
const hash = (value: string | Buffer) =>
    createHash('sha256').update(value).digest('hex')
const natural = new Intl.Collator('en', {
    numeric: true,
    sensitivity: 'variant'
})
const extensions = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp'])

function relativeName(value: string, directory = false) {
    const name = directory ? value.replace(/\/$/, '') : value
    const parts = name.split('/')
    if (
        !name ||
        name.length > 512 ||
        parts.length > LOCAL_IMPORT_LIMITS.depth ||
        /[\\:\x00-\x1f\x7f]/.test(name) ||
        parts.some(
            (p) =>
                !p ||
                p === '.' ||
                p === '..' ||
                /[. ]$/.test(p) ||
                /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p)
        )
    )
        throw new Error('Unsafe local comic path')
    return name.normalize('NFC')
}
function raster(data: Buffer, extension: string) {
    const png =
        data.length >= 24 &&
        data
            .subarray(0, 8)
            .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    const jpeg =
        data.length >= 4 &&
        data[0] === 255 &&
        data[1] === 216 &&
        data[2] === 255
    const gif = /^GIF8[79]a$/.test(data.subarray(0, 6).toString('ascii'))
    const webp =
        data.length >= 16 &&
        data.toString('ascii', 0, 4) === 'RIFF' &&
        data.toString('ascii', 8, 12) === 'WEBP'
    if (
        !(extension === '.png'
            ? png
            : extension === '.gif'
              ? gif
              : extension === '.webp'
                ? webp
                : jpeg)
    )
        throw new Error(
            'Local comic page is not the declared raster image type'
        )
}
async function readBounded(file: string, limit: number, root?: string) {
    const stat = await fs.promises.lstat(file)
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > limit)
        throw new Error('Local file is unsafe or too large')
    const real = await fs.promises.realpath(file)
    if (
        root &&
        (path.relative(root, real).startsWith('..') ||
            path.isAbsolute(path.relative(root, real)))
    )
        throw new Error('Local comic page escaped the selected folder')
    const handle = await fs.promises.open(
        file,
        constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0)
    )
    try {
        const before = await handle.stat()
        if (
            !before.isFile() ||
            before.size > limit ||
            before.ino !== stat.ino ||
            before.dev !== stat.dev
        )
            throw new Error('Local file changed during import')
        // Never readFile() an untrusted growing file: cap actual bytes, not just its initial stat.
        const chunks: Buffer[] = []
        let count = 0
        for (;;) {
            const buffer = Buffer.alloc(Math.min(64 * 1024, limit + 1 - count))
            const { bytesRead } = await handle.read(buffer)
            if (!bytesRead) break
            count += bytesRead
            if (count > limit)
                throw new Error('Local file exceeded the import limit')
            chunks.push(buffer.subarray(0, bytesRead))
        }
        const after = await handle.stat()
        if (
            after.size !== before.size ||
            after.mtimeMs !== before.mtimeMs ||
            count !== before.size
        )
            throw new Error('Local file changed during import')
        return Buffer.concat(chunks, count)
    } finally {
        await handle.close()
    }
}

function preflightZip(buffer: Buffer) {
    // Reject unsupported ZIP64/split archives before AdmZip allocates its entry table.
    const end = buffer.lastIndexOf(
        Buffer.from([0x50, 0x4b, 5, 6]),
        buffer.length - 22
    )
    if (
        end < 0 ||
        end + 22 > buffer.length ||
        end + 22 + buffer.readUInt16LE(end + 20) !== buffer.length ||
        buffer.readUInt16LE(end + 4) ||
        buffer.readUInt16LE(end + 6)
    )
        throw new Error('Unsupported or malformed CBZ directory')
    const count = buffer.readUInt16LE(end + 10),
        size = buffer.readUInt32LE(end + 12),
        start = buffer.readUInt32LE(end + 16)
    if (
        count > LOCAL_IMPORT_LIMITS.entries ||
        count !== buffer.readUInt16LE(end + 8) ||
        start + size !== end
    )
        throw new Error(
            'CBZ entry count/directory exceeds import limits (ZIP64 is not supported)'
        )
    let offset = start
    for (let i = 0; i < count; i++) {
        if (offset + 46 > end || buffer.readUInt32LE(offset) !== 0x02014b50)
            throw new Error('Malformed CBZ entry')
        const nameLength = buffer.readUInt16LE(offset + 28),
            local = buffer.readUInt32LE(offset + 42)
        if (
            local + 30 > start ||
            buffer.readUInt32LE(local) !== 0x04034b50 ||
            buffer.readUInt16LE(local + 26) !== nameLength ||
            local +
                30 +
                nameLength +
                buffer.readUInt16LE(local + 28) +
                buffer.readUInt32LE(offset + 20) >
                start ||
            !buffer
                .subarray(offset + 46, offset + 46 + nameLength)
                .equals(buffer.subarray(local + 30, local + 30 + nameLength))
        )
            throw new Error('CBZ local and central headers disagree')
        offset +=
            46 +
            nameLength +
            buffer.readUInt16LE(offset + 30) +
            buffer.readUInt16LE(offset + 32)
    }
    if (offset !== end) throw new Error('Malformed CBZ directory size')
}

/** No extraction to user-provided archive paths. AdmZip supplies ZIP metadata; Node caps inflation. */
async function scan(
    source: string,
    kind: Kind,
    onPage?: (page: Page, data: Buffer) => Promise<void>
): Promise<Snapshot> {
    const selected = await fs.promises.lstat(source)
    if (
        selected.isSymbolicLink() ||
        (kind === 'folder' ? !selected.isDirectory() : !selected.isFile())
    )
        throw new Error('Select a regular comic folder or CBZ file')
    const real = await fs.promises.realpath(source)
    if (kind === 'cbz' && path.extname(real).toLowerCase() !== '.cbz')
        throw new Error('Only CBZ archives are supported')
    const pages: Page[] = []
    let total = 0,
        entries = 0
    const names = new Set<string>()
    const accept = async (name: string, data: Buffer) => {
        const extension = path.posix.extname(name).toLowerCase()
        raster(data, extension)
        total += data.length
        if (
            total > LOCAL_IMPORT_LIMITS.totalBytes ||
            pages.length >= LOCAL_IMPORT_LIMITS.pages
        )
            throw new Error(
                'Local comic exceeds the page/total byte import limit'
            )
        const page = { name, extension, bytes: data.length, sha256: hash(data) }
        pages.push(page)
        await onPage?.(page, data)
    }
    const register = (name: string, directory: boolean) => {
        if (++entries > LOCAL_IMPORT_LIMITS.entries)
            throw new Error('Too many local comic entries')
        const normalized = relativeName(name, directory)
        const key = normalized.toLocaleLowerCase('und')
        if (names.has(key)) throw new Error('Duplicate local comic path')
        names.add(key)
        return normalized
    }
    if (kind === 'folder') {
        const walk = async (directory: string, prefix: string) => {
            for await (const entry of await fs.promises.opendir(directory)) {
                const original = prefix + entry.name
                const full = path.join(directory, entry.name)
                if (
                    entry.isSymbolicLink() ||
                    (!entry.isDirectory() && !entry.isFile())
                )
                    throw new Error('Links and special files are not supported')
                const name = register(original, entry.isDirectory())
                if (entry.isDirectory()) await walk(full, name + '/')
                else if (extensions.has(path.posix.extname(name).toLowerCase()))
                    await accept(
                        name,
                        await readBounded(
                            full,
                            LOCAL_IMPORT_LIMITS.pageBytes,
                            real
                        )
                    )
            }
        }
        await walk(real, '')
    } else {
        const buffer = await readBounded(real, LOCAL_IMPORT_LIMITS.archiveBytes)
        preflightZip(buffer)
        const zip = new AdmZip(buffer)
        const all = zip.getEntries()
        if (all.length > LOCAL_IMPORT_LIMITS.entries)
            throw new Error('Too many CBZ entries')
        let declaredTotal = 0
        for (const entry of all) {
            const name = register(entry.entryName, entry.isDirectory)
            const mode = (entry.attr >>> 16) & 0xf000
            if (
                entry.header.flags & 1 ||
                (mode && mode !== 0x8000 && mode !== 0x4000)
            )
                throw new Error(
                    'Encrypted or linked CBZ entries are not supported'
                )
            if (
                entry.isDirectory ||
                !extensions.has(path.posix.extname(name).toLowerCase())
            )
                continue
            declaredTotal += entry.header.size
            if (
                entry.header.size > LOCAL_IMPORT_LIMITS.pageBytes ||
                declaredTotal > LOCAL_IMPORT_LIMITS.totalBytes ||
                ![0, 8].includes(entry.header.method)
            )
                throw new Error(
                    'CBZ page size or compression exceeds the import limit'
                )
            const compressed = entry.getCompressedData()
            if (compressed.length !== entry.header.compressedSize)
                throw new Error('Truncated CBZ page')
            const data =
                entry.header.method === 0
                    ? compressed
                    : inflateRawSync(compressed, {
                          maxOutputLength: LOCAL_IMPORT_LIMITS.pageBytes
                      })
            if (
                data.length > LOCAL_IMPORT_LIMITS.pageBytes ||
                data.length !== entry.header.size ||
                crc32(data) !== entry.header.crc
            )
                throw new Error('CBZ page size or CRC does not match')
            await accept(name, data)
        }
    }
    if (!pages.length)
        throw new Error('No supported body pages found (JPG/PNG/GIF/WebP)')
    pages.sort(
        (a, b) =>
            natural.compare(a.name, b.name) || a.name.localeCompare(b.name)
    )
    const origin =
        process.platform === 'win32' ? real.toLocaleLowerCase('und') : real
    return {
        source: real,
        kind,
        title: path.basename(
            real,
            kind === 'cbz' ? path.extname(real) : undefined
        ),
        comicId: `local:${hash(`${kind}\n${origin}`)}`,
        revision: hash(JSON.stringify(pages)),
        pages
    }
}

/** User-selected path is private server state. HTTP callers can only confirm a short-lived opaque token. */
export class LocalLibraryIngestion {
    private pending?: { token: string; expires: number; snapshot: Snapshot }
    private busy = false
    constructor(
        private readonly database: LocalInventoryStore,
        private readonly dataDir: string
    ) {}

    private async validateSelection(source: string, kind: Kind) {
        const selected = await fs.promises.realpath(source)
        const library = await fs.promises.realpath(this.dataDir)
        const contains = (parent: string, child: string) => {
            const relative = path.relative(parent, child)
            return (
                !relative ||
                (!relative.startsWith('..') && !path.isAbsolute(relative))
            )
        }
        if (
            (kind === 'folder' && contains(selected, library)) ||
            contains(path.join(library, 'local-library'), selected)
        )
            throw new Error(
                'Select original comic files, not the Library root or its managed import copies'
            )
    }

    async preview(source: string, kind: Kind) {
        if (this.busy) throw new Error('Another local import is running')
        this.busy = true
        this.pending = undefined
        try {
            await this.validateSelection(path.resolve(source), kind)
            const snapshot = await scan(path.resolve(source), kind)
            const previous = this.database.getAppState<LocalInventoryV1>(
                localInventoryKey(snapshot.comicId)
            )
            const oldNames = new Set(previous?.pages.map((p) => p.name) ?? [])
            const newNames = new Set(snapshot.pages.map((p) => p.name))
            this.pending = {
                token: randomUUID(),
                expires: Date.now() + LOCAL_IMPORT_LIMITS.previewTtlMs,
                snapshot
            }
            return {
                token: this.pending.token,
                comicId: snapshot.comicId,
                title: snapshot.title,
                kind,
                pages: snapshot.pages.length,
                chapters: new Set(
                    snapshot.pages.map((p) => path.posix.dirname(p.name))
                ).size,
                bytes: snapshot.pages.reduce((n, p) => n + p.bytes, 0),
                existing: Boolean(previous),
                removedPages: [...oldNames].filter((n) => !newNames.has(n))
                    .length,
                unchanged: previous?.revision === snapshot.revision,
                sampleNames: snapshot.pages.slice(0, 8).map((p) => p.name)
            }
        } finally {
            this.busy = false
        }
    }

    cancel(token: string) {
        if (this.pending?.token === token) this.pending = undefined
    }

    private async ownedDirectory(relative: string) {
        const root = await fs.promises.realpath(this.dataDir)
        let directory = root
        for (const part of relative.split('/')) {
            if (!/^[a-z0-9-]+$/.test(part))
                throw new Error('Invalid owned import directory')
            directory = path.join(directory, part)
            await fs.promises
                .mkdir(directory)
                .catch((e: NodeJS.ErrnoException) => {
                    if (e.code !== 'EEXIST') throw e
                })
            const stat = await fs.promises.lstat(directory)
            if (
                stat.isSymbolicLink() ||
                !stat.isDirectory() ||
                (await fs.promises.realpath(directory)) !== directory
            )
                throw new Error('Local library directory is unsafe')
        }
        return directory
    }

    async confirm(token: string) {
        if (this.busy) throw new Error('Another local import is running')
        const pending = this.pending
        if (!pending || pending.token !== token || Date.now() > pending.expires)
            throw new Error(
                'Local import preview expired; select the file again'
            )
        this.busy = true
        this.pending = undefined // single use, including failed attempts
        const expected = pending.snapshot
        const expectedPages = new Map(
            expected.pages.map((page) => [page.name, page])
        )
        let directory: string | undefined
        let committed = false
        try {
            await this.validateSelection(expected.source, expected.kind)
            const relative = `local-library/${expected.comicId.slice(6)}/${randomUUID()}`
            directory = await this.ownedDirectory(relative)
            const actual = await scan(
                expected.source,
                expected.kind,
                async (page, data) => {
                    const old = expectedPages.get(page.name)
                    if (!old || old.sha256 !== page.sha256)
                        throw new Error(
                            'Local comic changed after preview; select it again'
                        )
                    await fs.promises.writeFile(
                        path.join(directory!, hash(page.name) + page.extension),
                        data,
                        { flag: 'wx' }
                    )
                }
            )
            if (
                actual.revision !== expected.revision ||
                actual.comicId !== expected.comicId
            )
                throw new Error(
                    'Local comic changed after preview; select it again'
                )
            const names = [
                ...new Set(actual.pages.map((p) => path.posix.dirname(p.name)))
            ]
            const chapters = names.map((name, index) => ({
                name,
                id: `${actual.comicId}:chapter:${hash(name)}`,
                order: index + 1,
                title: name === '.' ? actual.title : name
            }))
            const chaptersByName = new Map(
                chapters.map((chapter) => [chapter.name, chapter])
            )
            const positions = new Map<string, number>()
            const inventory: LocalInventoryV1 = {
                schemaVersion: 1,
                comicId: actual.comicId,
                kind: actual.kind,
                title: actual.title,
                revision: actual.revision,
                directory: relative,
                chapters,
                pages: actual.pages.map((page) => {
                    const chapter = chaptersByName.get(
                        path.posix.dirname(page.name)
                    )!
                    const position = (positions.get(chapter.id) ?? 0) + 1
                    positions.set(chapter.id, position)
                    return {
                        ...page,
                        id: `${actual.comicId}:page:${hash(page.name)}`,
                        episodeId: chapter.id,
                        position,
                        localPath: path.join(
                            directory!,
                            hash(page.name) + page.extension
                        )
                    }
                })
            }
            const previous = this.database.getAppState<LocalInventoryV1>(
                localInventoryKey(actual.comicId)
            )
            this.database.commitLocalInventory(inventory)
            committed = true
            let previousGenerationRetained = false
            if (previous && previous.directory !== inventory.directory) {
                // Only a previously committed generation for this exact local identity is disposable.
                try {
                    const parent = `local-library/${actual.comicId.slice(6)}/`
                    if (
                        !previous.directory.startsWith(parent) ||
                        !/^[a-f0-9-]{36}$/.test(
                            previous.directory.slice(parent.length)
                        )
                    )
                        throw new Error(
                            'Unrecognized previous import generation'
                        )
                    const prior = await this.ownedDirectory(previous.directory)
                    if (
                        path.dirname(prior) !== path.dirname(directory) ||
                        prior === directory
                    )
                        throw new Error('Unsafe previous import generation')
                    await fs.promises.rm(prior, {
                        recursive: true,
                        force: true
                    })
                } catch {
                    previousGenerationRetained = true
                } // cleanup cannot roll back a committed healthy inventory
            }
            return {
                comicId: actual.comicId,
                pages: inventory.pages.length,
                chapters: chapters.length,
                imported: true,
                previousGenerationRetained
            }
        } finally {
            // Only this invocation's new UUID generation is removed; prior generations/originals are never rollback targets.
            try {
                if (!committed && directory)
                    await fs.promises.rm(directory, {
                        recursive: true,
                        force: true
                    })
            } finally {
                this.busy = false
            }
        }
    }
}
