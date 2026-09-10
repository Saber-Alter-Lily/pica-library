import fs from 'node:fs'
import path from 'node:path'
import type { StoredComic } from './types'

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

export function materializePortableLibrary(
    dataDir: string,
    comics: StoredComic[],
    outputDir: string
) {
    const objectsRoot = path.join(dataDir, 'library', 'objects')
    fs.mkdirSync(outputDir, { recursive: true })
    let copied = 0
    let skipped = 0
    for (const comic of comics) {
        const source = path.join(objectsRoot, comic.comicId)
        if (!fs.existsSync(source)) {
            skipped += 1
            continue
        }
        fs.cpSync(source, path.join(outputDir, portableComicFolder(comic)), {
            recursive: true,
            force: true
        })
        copied += 1
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
    fs.writeFileSync(
        path.join(outputDir, 'pica-library-manifest.json'),
        JSON.stringify(manifest, null, 2)
    )
    return { outputDir, copied, skipped }
}

function createViewLink(source: string, destination: string) {
    if (fs.existsSync(destination)) return 'existing' as const
    fs.mkdirSync(path.dirname(destination), { recursive: true })
    try {
        const target =
            process.platform === 'win32'
                ? path.resolve(source)
                : path.relative(path.dirname(destination), source)
        fs.symlinkSync(
            target,
            destination,
            process.platform === 'win32' ? 'junction' : 'dir'
        )
        return 'linked' as const
    } catch {
        fs.mkdirSync(destination, { recursive: true })
        fs.writeFileSync(
            path.join(destination, '.pica-library-link.json'),
            JSON.stringify(
                { schemaVersion: 1, objectPath: path.resolve(source) },
                null,
                2
            )
        )
        return 'manifest' as const
    }
}

export function organizeLibraryViews(dataDir: string, comics: StoredComic[]) {
    const libraryRoot = path.join(dataDir, 'library')
    const objectsRoot = path.join(libraryRoot, 'objects')
    const viewsRoot = path.join(libraryRoot, 'views')
    let linked = 0
    let existing = 0
    let manifests = 0
    let skipped = 0

    const add = (source: string, destination: string) => {
        const result = createViewLink(source, destination)
        if (result === 'linked') linked += 1
        else if (result === 'manifest') manifests += 1
        else existing += 1
    }

    for (const comic of comics) {
        const source = path.join(objectsRoot, comic.comicId)
        if (!fs.existsSync(source)) {
            skipped += 1
            continue
        }
        const comicFolder = `${safeSegment(comic.title, 'untitled')} [${comic.comicId}]`
        const author = safeSegment(
            comic.canonicalAuthor ?? comic.author,
            'unknown-author'
        )
        add(source, path.join(viewsRoot, 'by-author', author, comicFolder))
        if (comic.circle) {
            add(
                source,
                path.join(
                    viewsRoot,
                    'by-circle',
                    safeSegment(comic.circle, 'unknown-circle'),
                    comicFolder
                )
            )
        }
    }

    const result = {
        generatedAt: new Date().toISOString(),
        viewsRoot,
        linked,
        existing,
        manifests,
        skipped
    }
    fs.mkdirSync(viewsRoot, { recursive: true })
    fs.writeFileSync(
        path.join(viewsRoot, 'index.json'),
        JSON.stringify({ ...result, comics }, null, 2)
    )
    return result
}
