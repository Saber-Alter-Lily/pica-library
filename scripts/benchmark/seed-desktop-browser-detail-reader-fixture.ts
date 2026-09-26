import fs from 'node:fs'
import path from 'node:path'
import { LibraryDatabase } from '../../src/library/database'

function optionValue(name: string) {
    const prefix = `--${name}=`
    const inline = process.argv.slice(2).find((arg) => arg.startsWith(prefix))
    if (inline) return inline.slice(prefix.length)
    const index = process.argv.indexOf(`--${name}`)
    return index >= 0 ? process.argv[index + 1] : undefined
}

const libraryDirectory = optionValue('library-dir')
const output = optionValue('output')
if (!libraryDirectory) throw new Error('--library-dir is required')
if (!output) throw new Error('--output is required')

const root = path.resolve(libraryDirectory)
fs.mkdirSync(root, { recursive: true })

const databaseFile = path.join(root, 'library.db')
for (const suffix of ['', '-wal', '-shm'])
    fs.rmSync(`${databaseFile}${suffix}`, { force: true })

const database = new LibraryDatabase(databaseFile)
const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aO0sAAAAASUVORK5CYII=',
    'base64'
)

const comics = [
    {
        comicId: 'j5-local-1',
        title: 'J5 本地漫画一',
        author: 'J5 示例作者',
        description: 'J5 detail/shelf/reader benchmark fixture',
        categories: ['基准'],
        tags: ['本地', '阅读'],
        finished: true,
        updatedAt: '2026-09-26T00:00:03.000Z'
    },
    {
        comicId: 'j5-local-2',
        title: 'J5 本地漫画二',
        author: 'J5 示例作者',
        description: 'J5 local fixture two',
        categories: ['基准'],
        tags: ['本地'],
        finished: false,
        updatedAt: '2026-09-26T00:00:02.000Z'
    },
    {
        comicId: 'j5-local-3',
        title: 'J5 本地漫画三',
        author: 'J5 另一作者',
        description: 'J5 local fixture three',
        categories: ['基准'],
        tags: ['书架'],
        finished: true,
        updatedAt: '2026-09-26T00:00:01.000Z'
    }
]

database.importFavorites(comics, 'benchmark:j5', true, true)

const firstComicId = comics[0].comicId
const episodeIds = ['j5-local-1-ep-1', 'j5-local-1-ep-2']
for (let episodeIndex = 0; episodeIndex < episodeIds.length; episodeIndex++) {
    const episodeId = episodeIds[episodeIndex]
    database.upsertEpisode({
        id: episodeId,
        comicId: firstComicId,
        title: episodeIndex === 0 ? 'J5 第一章' : 'J5 第二章',
        order: episodeIndex + 1
    })
    for (let pageIndex = 0; pageIndex < 3; pageIndex++) {
        const pictureId = `${episodeId}-page-${pageIndex + 1}`
        const local = path.join(
            root,
            'benchmark-pages',
            episodeId,
            `${String(pageIndex + 1).padStart(3, '0')}.png`
        )
        fs.mkdirSync(path.dirname(local), { recursive: true })
        fs.writeFileSync(local, png)
        database.upsertPicture({
            id: pictureId,
            comicId: firstComicId,
            episodeId,
            position: pageIndex + 1,
            originalName: path.basename(local),
            mediaPath: path.basename(local),
            fileServer: 'https://media.invalid'
        })
        database.markPictureDownloaded(
            pictureId,
            local,
            png.byteLength,
            `j5-${episodeIndex + 1}-${pageIndex + 1}`
        )
    }
}

const shelf = database.createShelf('J5 基准书架')
database.addShelfItems(shelf.id, [firstComicId, comics[1].comicId])
database.close()

const fixture = {
    schemaVersion: 1,
    comicId: firstComicId,
    comicTitle: comics[0].title,
    shelfId: shelf.id,
    shelfName: shelf.name,
    firstEpisodeId: episodeIds[0],
    firstEpisodeTitle: 'J5 第一章',
    secondEpisodeId: episodeIds[1],
    secondEpisodeTitle: 'J5 第二章',
    pageCountPerEpisode: 3
}

const target = path.resolve(output)
fs.mkdirSync(path.dirname(target), { recursive: true })
fs.writeFileSync(target, `${JSON.stringify(fixture, null, 2)}\n`, 'utf8')
process.stdout.write(`${JSON.stringify(fixture)}\n`)
