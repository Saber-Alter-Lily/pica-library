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
    type GeneratedLocalChapter,
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

    private async ownedDirectory(
        relative: string,
        create = true,
        exclusiveLeaf = false
    ) {
        const root = await fs.promises.realpath(this.dataDir)
        let directory = root
        const parts = relative.split('/')
        for (const [index, part] of parts.entries()) {
            if (!/^[a-z0-9-]+$/.test(part))
                throw new Error('Invalid owned import directory')
            directory = path.join(directory, part)
            if (create)
                await fs.promises
                    .mkdir(directory)
                    .catch((e: NodeJS.ErrnoException) => {
                        if (
                            e.code !== 'EEXIST' ||
                            (exclusiveLeaf && index === parts.length - 1)
                        )
                            throw e
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

    /** The existing atomic DB switch and owned-generation retirement, shared by both import paths. */
    private async commitGeneration(
        inventory: LocalInventoryV1,
        directory: string,
        didCommit: () => void,
        assertAccess: () => void = () => {}
    ) {
        const previous = this.database.getAppState<LocalInventoryV1>(
            localInventoryKey(inventory.comicId)
        )
        assertAccess()
        this.database.commitLocalInventory(inventory)
        didCommit() // no await between successful DB switch and recording ownership
        let previousGenerationRetained = false
        if (previous && previous.directory !== inventory.directory) {
            try {
                const parent = `local-library/${inventory.comicId.slice(6)}/`
                if (
                    !previous.directory.startsWith(parent) ||
                    !/^[a-f0-9-]{36}$/.test(
                        previous.directory.slice(parent.length)
                    )
                )
                    throw new Error('Unrecognized previous import generation')
                const prior = await this.ownedDirectory(
                    previous.directory,
                    false
                )
                if (
                    path.dirname(prior) !== path.dirname(directory) ||
                    prior === directory
                )
                    throw new Error('Unsafe previous import generation')
                await fs.promises.rm(prior, { recursive: true, force: true })
            } catch {
                previousGenerationRetained = true
            }
        }
        return {
            comicId: inventory.comicId,
            pages: inventory.pages.length,
            chapters: inventory.chapters.length,
            imported: true,
            previousGenerationRetained
        }
    }

    /** Publishes one fetched chapter through the SAME managed inventory and local Reader format.
     * Previous chapters are verified/copied locally, never fetched again or relabelled favorites.
     * No source credentials, remote URLs, scheduler, network or SQLite implementation is owned here.
     */
    async importGeneratedChapter(input: GeneratedLocalChapter) {
        if (this.busy) throw new Error('Another local import is running')
        if (!input || typeof input !== 'object')
            throw new Error('Invalid generated local chapter')
        const {
            comicKey,
            title,
            chapterKey,
            chapterTitle,
            orderHint,
            pageCount
        } = input
        const label = (value: unknown) =>
            typeof value === 'string' &&
            value.trim().length > 0 &&
            value.length <= 500 &&
            !/[\u0000-\u001f\u007f]/.test(value)
        if (
            typeof comicKey !== 'string' ||
            typeof chapterKey !== 'string' ||
            !/^[a-f0-9]{64}$/.test(comicKey) ||
            !/^[a-f0-9]{64}$/.test(chapterKey) ||
            !label(title) ||
            !label(chapterTitle) ||
            !Number.isFinite(orderHint) ||
            Math.abs(orderHint) > 1e9 ||
            !Number.isInteger(pageCount) ||
            pageCount < 1 ||
            pageCount > LOCAL_IMPORT_LIMITS.pages ||
            typeof input.assertAccess !== 'function' ||
            typeof input.readPage !== 'function'
        )
            throw new Error('Invalid generated local chapter')
        const assertAccess = input.assertAccess.bind(input),
            readPage = input.readPage.bind(input)
        this.busy = true
        let directory: string | undefined,
            committed = false
        try {
            assertAccess()
            const comicId =
                'local:' + hash('owned-generated-pages-v1\n' + comicKey)
            const name = 'chapter-' + chapterKey,
                chapterId = `${comicId}:chapter:${hash(name)}`
            const key = localInventoryKey(comicId),
                previous = this.database.getAppState<LocalInventoryV1>(key)
            const previousRevision = previous?.revision,
                previousDirectory = previous?.directory
            let prior: string | undefined
            if (previous) {
                if (
                    previous.schemaVersion !== 1 ||
                    previous.kind !== 'folder' ||
                    previous.comicId !== comicId ||
                    !Array.isArray(previous.pages) ||
                    !previous.pages.length ||
                    previous.pages.length > LOCAL_IMPORT_LIMITS.pages ||
                    !Array.isArray(previous.chapters) ||
                    !previous.chapters.length ||
                    previous.chapters.length > LOCAL_IMPORT_LIMITS.pages ||
                    !new RegExp(
                        '^local-library/' + comicId.slice(6) + '/[a-f0-9-]{36}$'
                    ).test(previous.directory)
                )
                    throw new Error(
                        'Generated inventory is invalid; existing data retained'
                    )
                const seen = new Set<string>()
                for (const chapter of previous.chapters) {
                    if (
                        !/^chapter-[a-f0-9]{64}$/.test(chapter.name) ||
                        chapter.id !==
                            `${comicId}:chapter:${hash(chapter.name)}` ||
                        seen.has(chapter.id) ||
                        !label(chapter.title) ||
                        typeof chapter.orderHint !== 'number' ||
                        !Number.isFinite(chapter.orderHint) ||
                        Math.abs(chapter.orderHint) > 1e9
                    )
                        throw new Error(
                            'Generated inventory is invalid; existing data retained'
                        )
                    seen.add(chapter.id)
                }
                prior = await this.ownedDirectory(previous.directory, false)
            }
            const chapters = [
                ...(previous?.chapters ?? [])
                    .filter((chapter) => chapter.id !== chapterId)
                    .map((chapter) => ({
                        id: chapter.id,
                        name: chapter.name,
                        order: chapter.order,
                        orderHint: chapter.orderHint,
                        title: chapter.title
                    })),
                {
                    id: chapterId,
                    name,
                    order: 0,
                    orderHint,
                    title: chapterTitle
                }
            ]
                .sort(
                    (a, b) =>
                        a.orderHint! - b.orderHint! ||
                        a.name.localeCompare(b.name)
                )
                .map((chapter, index) => ({ ...chapter, order: index + 1 }))
            const kept = (previous?.pages ?? []).filter(
                (page) => page.episodeId !== chapterId
            )
            if (kept.length + pageCount > LOCAL_IMPORT_LIMITS.pages)
                throw new Error(
                    'Local comic exceeds the page/total byte import limit'
                )
            for (const chapter of chapters.filter(
                (chapter) => chapter.id !== chapterId
            )) {
                const existing = kept
                    .filter((page) => page.episodeId === chapter.id)
                    .sort((a, b) => a.position - b.position)
                if (
                    !existing.length ||
                    existing.some((page, index) => page.position !== index + 1)
                )
                    throw new Error(
                        'Generated inventory is invalid; existing data retained'
                    )
            }
            const relative = `local-library/${comicId.slice(6)}/${randomUUID()}`
            directory = await this.ownedDirectory(relative, true, true)
            const pages: LocalInventoryV1['pages'] = [],
                seen = new Set<string>()
            let bytes = 0
            const writePage = async (
                page: Page,
                episodeId: string,
                position: number,
                data: Buffer
            ) => {
                assertAccess()
                raster(data, page.extension)
                bytes += data.length
                if (
                    data.length < 1 ||
                    data.length > LOCAL_IMPORT_LIMITS.pageBytes ||
                    bytes > LOCAL_IMPORT_LIMITS.totalBytes ||
                    seen.has(page.name)
                )
                    throw new Error(
                        'Local comic exceeds the page/total byte import limit'
                    )
                seen.add(page.name)
                const localPath = path.join(
                    directory!,
                    hash(page.name) + page.extension
                )
                await fs.promises.writeFile(localPath, data, { flag: 'wx' })
                assertAccess()
                pages.push({
                    name: page.name,
                    extension: page.extension,
                    bytes: page.bytes,
                    sha256: page.sha256,
                    id: `${comicId}:page:${hash(page.name)}`,
                    episodeId,
                    position,
                    localPath
                })
            }
            for (const page of kept) {
                const chapter = chapters.find(
                    (chapter) => chapter.id === page.episodeId
                )
                if (
                    !chapter ||
                    !Number.isInteger(page.position) ||
                    page.position < 1 ||
                    !extensions.has(page.extension) ||
                    page.name !==
                        `${chapter.name}/${String(page.position).padStart(4, '0')}${page.extension}` ||
                    page.id !== `${comicId}:page:${hash(page.name)}` ||
                    !/^[a-f0-9]{64}$/.test(page.sha256) ||
                    !Number.isSafeInteger(page.bytes) ||
                    page.bytes < 1 ||
                    page.bytes > LOCAL_IMPORT_LIMITS.pageBytes ||
                    page.localPath !==
                        path.join(prior!, hash(page.name) + page.extension)
                )
                    throw new Error(
                        'Generated inventory is invalid; existing data retained'
                    )
                const data = await readBounded(
                    page.localPath,
                    LOCAL_IMPORT_LIMITS.pageBytes,
                    prior
                )
                if (data.length !== page.bytes || hash(data) !== page.sha256)
                    throw new Error(
                        'Saved page changed; existing data retained'
                    )
                await writePage(page, page.episodeId, page.position, data)
            }
            for (let index = 0; index < pageCount; index++) {
                assertAccess()
                const image = await readPage(index)
                assertAccess()
                if (
                    !image ||
                    !Buffer.isBuffer(image.data) ||
                    image.data.length > LOCAL_IMPORT_LIMITS.pageBytes ||
                    !extensions.has(image.extension)
                )
                    throw new Error('Generated page type is invalid')
                const pageName = `${name}/${String(index + 1).padStart(4, '0')}${image.extension}`
                await writePage(
                    {
                        name: pageName,
                        extension: image.extension,
                        bytes: image.data.length,
                        sha256: hash(image.data)
                    },
                    chapterId,
                    index + 1,
                    image.data
                )
            }
            // No await between access/revision checks and the existing atomic commit.
            assertAccess()
            const current = this.database.getAppState<LocalInventoryV1>(key)
            if (
                current?.revision !== previousRevision ||
                current?.directory !== previousDirectory
            )
                throw new Error('Local inventory changed; retry explicitly')
            pages.sort(
                (a, b) =>
                    chapters.findIndex(
                        (chapter) => chapter.id === a.episodeId
                    ) -
                        chapters.findIndex(
                            (chapter) => chapter.id === b.episodeId
                        ) || a.position - b.position
            )
            const revision = hash(
                JSON.stringify({
                    chapters: chapters.map((chapter) => [
                        chapter.id,
                        chapter.title,
                        chapter.orderHint
                    ]),
                    pages: pages.map((page) => [
                        page.name,
                        page.sha256,
                        page.bytes
                    ])
                })
            )
            const result = await this.commitGeneration(
                {
                    schemaVersion: 1,
                    kind: 'folder',
                    comicId,
                    title,
                    revision,
                    directory: relative,
                    chapters,
                    pages
                },
                directory,
                () => {
                    committed = true
                },
                assertAccess
            )
            return { ...result, episodeId: chapterId }
        } finally {
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
            directory = await this.ownedDirectory(relative, true, true)
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
            return await this.commitGeneration(inventory, directory, () => {
                committed = true
            })
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
