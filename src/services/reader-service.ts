import fs from 'node:fs'
import path from 'node:path'
import AdmZip from 'adm-zip'
import type { LibraryDatabase } from '../library/database'
import { safePathSegment } from '../library/path-template'
import { ExternalReaderAdapter } from './external-reader-adapter'

const contentTypes: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.gif': 'image/gif'
}

export class ReaderService {
    private readonly root: string

    constructor(
        private readonly database: LibraryDatabase,
        dataDir: string,
        private readonly externalReader = new ExternalReaderAdapter()
    ) {
        this.root = path.resolve(dataDir)
    }

    chapters(comicId: string) {
        return this.database.listReaderEpisodes(comicId)
    }

    chapter(comicId: string, episodeId: string) {
        const episode = this.database
            .listReaderEpisodes(comicId)
            .find((item) => item.id === episodeId)
        if (!episode) throw new Error('章节不存在')
        const pictures = this.database.listDownloadedPictures(episodeId)
        if (!pictures.length) throw new Error('该章节尚未下载。')
        return {
            episode,
            pages: pictures.map((picture) => ({
                id: picture.id,
                position: picture.position,
                url: `/api/v1/reader/pictures/${encodeURIComponent(picture.id)}`
            })),
            progress: this.database
                .readingProgress(comicId)
                .find((item) => item.episodeId === episodeId)
        }
    }

    private safeLocalFile(file: string) {
        const resolved = path.resolve(file)
        if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile())
            throw new Error('Downloaded page is unavailable')
        const realRoot = fs.realpathSync(this.root)
        const realFile = fs.realpathSync(resolved)
        const relative = path.relative(realRoot, realFile)
        if (relative.startsWith('..') || path.isAbsolute(relative))
            throw new Error('Reader file escaped the Library root')
        return realFile
    }

    picture(pictureId: string) {
        const picture = this.database.getDownloadedPicture(pictureId)
        if (!picture) throw new Error('Downloaded page is unavailable')
        const file = this.safeLocalFile(picture.localPath)
        const contentType = contentTypes[path.extname(file).toLowerCase()]
        if (!contentType) throw new Error('Downloaded page type is unsafe')
        return { data: fs.readFileSync(file), contentType }
    }

    saveProgress(comicId: string, episodeId: string, pageIndex: number) {
        const episode = this.database
            .listReaderEpisodes(comicId)
            .find((item) => item.id === episodeId)
        if (!episode) throw new Error('章节不存在')
        const downloadedPages = this.database.listDownloadedPictures(episodeId)
        if (
            !Number.isInteger(pageIndex) ||
            pageIndex < 0 ||
            pageIndex >= downloadedPages.length
        )
            throw new Error('阅读页码无效')
        return this.database.saveReadingProgress(comicId, episodeId, pageIndex)
    }

    recentProgress() {
        return this.database.readingProgress().slice(0, 20)
    }

    exportCbz(comicId: string, episodeId: string) {
        const comic = this.database.getComic(comicId)
        const episode = this.database
            .listReaderEpisodes(comicId)
            .find((item) => item.id === episodeId)
        if (!comic || !episode) throw new Error('漫画或章节不存在')
        const pictures = this.database.listDownloadedPictures(episodeId)
        if (!pictures.length) throw new Error('该章节尚未下载。')
        const outputDirectory = path.join(this.root, 'exports', 'cbz')
        fs.mkdirSync(outputDirectory, { recursive: true })
        const output = path.join(
            outputDirectory,
            `${safePathSegment(comic.canonicalAuthor ?? comic.author, '未知作者')} - ${safePathSegment(comic.title, comicId)} - ${safePathSegment(episode.title, episodeId)}.cbz`
        )
        const zip = new AdmZip()
        const width = String(pictures.length).length
        for (let index = 0; index < pictures.length; index++) {
            const file = this.safeLocalFile(pictures[index].localPath)
            const extension = path.extname(file).toLowerCase()
            if (!contentTypes[extension])
                throw new Error('CBZ contains an unsafe page type')
            zip.addFile(
                `${String(index + 1).padStart(width, '0')}${extension}`,
                fs.readFileSync(file)
            )
        }
        zip.writeZip(output)
        return {
            path: output,
            pages: pictures.length,
            bytes: fs.statSync(output).size
        }
    }

    openDefault(file: string) {
        const safe = this.safeLocalFile(file)
        return this.externalReader.openDefault(safe)
    }
}
