import fs from 'node:fs'
import path from 'node:path'
import type { StoredComic } from './types'

export interface LibraryOrganizeProgress {
    phase: 'organizing' | 'materializing'
    done: number
    total: number
    linked?: number
    existing?: number
    manifests?: number
    copied?: number
    skipped: number
}

export interface LibraryOrganizeOptions {
    checkpoint?: () => Promise<void> | void
    onProgress?: (progress: LibraryOrganizeProgress) => void
    yieldEvery?: number
}

export function safeSegment(value: string, fallback: string) {
    const normalized = value
        .normalize('NFKC')
        .trim()
        // eslint-disable-next-line no-control-regex
        .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_')
        .replace(/[. ]+$/g, '')
        .slice(0, 100)
    return normalized || fallback
}

export function portableComicFolder(comic: StoredComic) {
    const author = safeSegment(
        comic.canonicalAuthor ?? comic.author,
        'unknown-author'
    )
    const title = safeSegment(comic.title, 'untitled')
    const shortId = safeSegment(comic.comicId.slice(0, 8), 'unknown-id')
    return `[${author}] ${title} [${shortId}]`
}

function missingFile(error: unknown) {
    return Boolean(
        error &&
            typeof error === 'object' &&
            'code' in error &&
            (error as NodeJS.ErrnoException).code === 'ENOENT'
    )
}

async function exists(file: string) {
    try {
        await fs.promises.access(file)
        return true
    } catch (error) {
        if (missingFile(error)) return false
        throw error
    }
}

async function yieldToEventLoop() {
    await new Promise<void>((resolve) => setImmediate(resolve))
}

async function replaceFile(temporary: string, file: string) {
    try {
        await fs.promises.rename(temporary, file)
        return
    } catch (error) {
        const code =
            error && typeof error === 'object' && 'code' in error
                ? String((error as NodeJS.ErrnoException).code ?? '')
                : ''
        if (!['EEXIST', 'EPERM', 'ENOTEMPTY'].includes(code)) throw error
    }

    const previous = `${file}.pica-old-${process.pid}`
    await fs.promises.rm(previous, { force: true }).catch(() => undefined)
    let movedPrevious = false
    try {
        if (await exists(file)) {
            await fs.promises.rename(file, previous)
            movedPrevious = true
        }
        await fs.promises.rename(temporary, file)
        if (movedPrevious)
            await fs.promises.rm(previous, { force: true }).catch(() => undefined)
    } catch (error) {
        if (movedPrevious && !(await exists(file)))
            await fs.promises.rename(previous, file)
        throw error
    } finally {
        await fs.promises.rm(previous, { force: true }).catch(() => undefined)
    }
}

async function writeJsonAtomically(file: string, value: unknown) {
    await fs.promises.mkdir(path.dirname(file), { recursive: true })
    const temporary = `${file}.pica-new-${process.pid}`
    try {
        await fs.promises.writeFile(
            temporary,
            JSON.stringify(value, null, 2),
            'utf8'
        )
        await replaceFile(temporary, file)
    } finally {
        await fs.promises.rm(temporary, { force: true }).catch(() => undefined)
    }
}

export async function materializePortableLibrary(
    dataDir: string,
    comics: StoredComic[],
    outputDir: string,
    options: LibraryOrganizeOptions = {}
) {
    const objectsRoot = path.join(dataDir, 'library', 'objects')
    await fs.promises.mkdir(outputDir, { recursive: true })
    const yieldEvery = Math.max(
        1,
        Math.floor(Number(options.yieldEvery) || 10)
    )
    let copied = 0
    let skipped = 0

    for (let index = 0; index < comics.length; index += 1) {
        await options.checkpoint?.()
        const comic = comics[index]
        const source = path.join(objectsRoot, comic.comicId)
        if (!(await exists(source))) {
            skipped += 1
        } else {
            const destination = path.join(
                outputDir,
                portableComicFolder(comic)
            )
            const temporary = `${destination}.pica-copying-${process.pid}`
            await fs.promises.rm(temporary, {
                recursive: true,
                force: true
            })
            try {
                await fs.promises.cp(source, temporary, {
                    recursive: true,
                    force: true
                })
                await options.checkpoint?.()
                await fs.promises.rm(destination, {
                    recursive: true,
                    force: true
                })
                await fs.promises.rename(temporary, destination)
                copied += 1
            } finally {
                await fs.promises
                    .rm(temporary, { recursive: true, force: true })
                    .catch(() => undefined)
            }
        }

        options.onProgress?.({
            phase: 'materializing',
            done: index + 1,
            total: comics.length,
            copied,
            skipped
        })
        if ((index + 1) % yieldEvery === 0) await yieldToEventLoop()
    }

    const manifest = {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        naming: '[canonical-author] title [short-id]',
        copied,
        skipped,
        comics: comics.map((comic) => ({
            comicId: comic.comicId,
            title: comic.title,
            author: comic.canonicalAuthor ?? comic.author,
            folder: portableComicFolder(comic)
        }))
    }
    await options.checkpoint?.()
    await writeJsonAtomically(
        path.join(outputDir, 'pica-library-manifest.json'),
        manifest
    )
    return { outputDir, copied, skipped }
}

async function createViewLink(source: string, destination: string) {
    if (await exists(destination)) return 'existing' as const
    await fs.promises.mkdir(path.dirname(destination), { recursive: true })
    try {
        const target =
            process.platform === 'win32'
                ? path.resolve(source)
                : path.relative(path.dirname(destination), source)
        await fs.promises.symlink(
            target,
            destination,
            process.platform === 'win32' ? 'junction' : 'dir'
        )
        return 'linked' as const
    } catch {
        await fs.promises.mkdir(destination, { recursive: true })
        await writeJsonAtomically(
            path.join(destination, '.pica-library-link.json'),
            { schemaVersion: 1, objectPath: path.resolve(source) }
        )
        return 'manifest' as const
    }
}

export async function organizeLibraryViews(
    dataDir: string,
    comics: StoredComic[],
    options: LibraryOrganizeOptions = {}
) {
    const libraryRoot = path.join(dataDir, 'library')
    const objectsRoot = path.join(libraryRoot, 'objects')
    const viewsRoot = path.join(libraryRoot, 'views')
    const yieldEvery = Math.max(
        1,
        Math.floor(Number(options.yieldEvery) || 25)
    )
    let linked = 0
    let existing = 0
    let manifests = 0
    let skipped = 0

    const add = async (source: string, destination: string) => {
        const result = await createViewLink(source, destination)
        if (result === 'linked') linked += 1
        else if (result === 'manifest') manifests += 1
        else existing += 1
    }

    for (let index = 0; index < comics.length; index += 1) {
        await options.checkpoint?.()
        const comic = comics[index]
        const source = path.join(objectsRoot, comic.comicId)
        if (!(await exists(source))) {
            skipped += 1
        } else {
            const comicFolder = `${safeSegment(comic.title, 'untitled')} [${comic.comicId}]`
            const author = safeSegment(
                comic.canonicalAuthor ?? comic.author,
                'unknown-author'
            )
            await add(
                source,
                path.join(viewsRoot, 'by-author', author, comicFolder)
            )
            if (comic.circle)
                await add(
                    source,
                    path.join(
                        viewsRoot,
                        'by-circle',
                        safeSegment(comic.circle, 'unknown-circle'),
                        comicFolder
                    )
                )
        }

        options.onProgress?.({
            phase: 'organizing',
            done: index + 1,
            total: comics.length,
            linked,
            existing,
            manifests,
            skipped
        })
        if ((index + 1) % yieldEvery === 0) await yieldToEventLoop()
    }

    const result = {
        generatedAt: new Date().toISOString(),
        viewsRoot,
        linked,
        existing,
        manifests,
        skipped
    }
    await options.checkpoint?.()
    await writeJsonAtomically(
        path.join(viewsRoot, 'index.json'),
        { ...result, comics }
    )
    return result
}
