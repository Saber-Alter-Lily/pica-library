import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import type { DatabaseSync as DatabaseSyncType } from 'node:sqlite'
import {
    authorIdForKey,
    normalizeAuthorKey,
    parseAuthorIdentity
} from './author'
import type {
    AuthorGroup,
    ComicQuery,
    FavoriteRecord,
    ImportResult,
    LibrarySummary,
    StoredComic
} from './types'

type SqlRow = Record<string, unknown>

// Vite 5 predates node:sqlite and attempts to bundle it as a package. Loading
// through Node's require keeps the built-in external in both production and tests.
const { DatabaseSync } = createRequire(import.meta.url)(
    'node:sqlite'
) as typeof import('node:sqlite')

function jsonArray(value: unknown): string[] {
    try {
        const parsed = JSON.parse(String(value ?? '[]'))
        return Array.isArray(parsed) ? parsed.map(String) : []
    } catch {
        return []
    }
}

function numberValue(value: unknown): number {
    const number = Number(value)
    return Number.isFinite(number) ? number : 0
}

export class LibraryDatabase {
    readonly file: string
    private readonly db: DatabaseSyncType

    constructor(file: string) {
        this.file = path.resolve(file)
        fs.mkdirSync(path.dirname(this.file), { recursive: true })
        this.db = new DatabaseSync(this.file)
        this.db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;')
        this.migrate()
    }

    close() {
        this.db.close()
    }

    private migrate() {
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS schema_migrations (
                version INTEGER PRIMARY KEY,
                applied_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS authors (
                id TEXT PRIMARY KEY,
                canonical_name TEXT NOT NULL,
                normalized_key TEXT NOT NULL UNIQUE,
                confidence REAL NOT NULL DEFAULT 1,
                evidence TEXT NOT NULL DEFAULT '',
                review_status TEXT NOT NULL DEFAULT 'approved',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS author_aliases (
                alias_key TEXT PRIMARY KEY,
                alias_display TEXT NOT NULL,
                author_id TEXT NOT NULL REFERENCES authors(id) ON DELETE CASCADE,
                source TEXT NOT NULL,
                evidence TEXT NOT NULL DEFAULT '',
                confidence REAL NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS comics (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                raw_author TEXT NOT NULL DEFAULT '',
                circle TEXT,
                author_candidate TEXT,
                canonical_author_id TEXT REFERENCES authors(id),
                description TEXT NOT NULL DEFAULT '',
                chinese_team TEXT NOT NULL DEFAULT '',
                categories_json TEXT NOT NULL DEFAULT '[]',
                tags_json TEXT NOT NULL DEFAULT '[]',
                finished INTEGER NOT NULL DEFAULT 0,
                created_at_source TEXT,
                updated_at_source TEXT,
                total_likes INTEGER NOT NULL DEFAULT 0,
                total_views INTEGER NOT NULL DEFAULT 0,
                pages_count INTEGER NOT NULL DEFAULT 0,
                eps_count INTEGER NOT NULL DEFAULT 0,
                is_favorite INTEGER NOT NULL DEFAULT 0,
                first_seen_at TEXT NOT NULL,
                last_seen_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS comic_authors (
                comic_id TEXT NOT NULL REFERENCES comics(id) ON DELETE CASCADE,
                author_id TEXT NOT NULL REFERENCES authors(id) ON DELETE CASCADE,
                raw_value TEXT NOT NULL,
                circle TEXT,
                role TEXT NOT NULL DEFAULT 'creator',
                is_primary INTEGER NOT NULL DEFAULT 1,
                confidence REAL NOT NULL DEFAULT 1,
                needs_review INTEGER NOT NULL DEFAULT 0,
                evidence TEXT NOT NULL DEFAULT '',
                PRIMARY KEY (comic_id, author_id, raw_value)
            );

            CREATE TABLE IF NOT EXISTS episodes (
                id TEXT PRIMARY KEY,
                comic_id TEXT NOT NULL REFERENCES comics(id) ON DELETE CASCADE,
                title TEXT NOT NULL,
                order_no INTEGER NOT NULL,
                updated_at_source TEXT,
                first_seen_at TEXT NOT NULL,
                last_seen_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS pictures (
                id TEXT PRIMARY KEY,
                comic_id TEXT NOT NULL REFERENCES comics(id) ON DELETE CASCADE,
                episode_id TEXT NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
                position INTEGER NOT NULL,
                original_name TEXT NOT NULL,
                media_path TEXT NOT NULL,
                file_server TEXT NOT NULL,
                local_path TEXT,
                byte_size INTEGER,
                sha256 TEXT,
                status TEXT NOT NULL DEFAULT 'pending',
                first_seen_at TEXT NOT NULL,
                last_seen_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS sync_runs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                source TEXT NOT NULL,
                status TEXT NOT NULL,
                started_at TEXT NOT NULL,
                finished_at TEXT,
                item_count INTEGER NOT NULL DEFAULT 0,
                error TEXT
            );

            CREATE INDEX IF NOT EXISTS idx_comics_favorite ON comics(is_favorite);
            CREATE INDEX IF NOT EXISTS idx_comics_author ON comics(canonical_author_id);
            CREATE INDEX IF NOT EXISTS idx_episodes_comic ON episodes(comic_id, order_no);
            CREATE INDEX IF NOT EXISTS idx_pictures_episode ON pictures(episode_id, position);
        `)
    }

    importFavorites(
        records: FavoriteRecord[],
        source = 'import',
        completeSnapshot = true,
        markFavorite = true
    ): ImportResult {
        const now = new Date().toISOString()
        const run = this.db
            .prepare(
                `INSERT INTO sync_runs(source, status, started_at)
                 VALUES (?, 'running', ?)`
            )
            .run(source, now)
        const runId = Number(run.lastInsertRowid)
        const existsStatement = this.db.prepare(
            'SELECT 1 AS found FROM comics WHERE id = ?'
        )
        const aliasLookup = this.db.prepare(
            'SELECT author_id FROM author_aliases WHERE alias_key = ?'
        )
        const authorUpsert = this.db.prepare(`
            INSERT INTO authors(
                id, canonical_name, normalized_key, confidence, evidence,
                review_status, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(normalized_key) DO UPDATE SET
                confidence = MIN(authors.confidence, excluded.confidence),
                evidence = CASE
                    WHEN authors.evidence = excluded.evidence THEN authors.evidence
                    ELSE authors.evidence || '; ' || excluded.evidence
                END,
                review_status = CASE
                    WHEN authors.review_status = 'approved'
                         AND excluded.review_status = 'pending'
                    THEN 'pending'
                    ELSE authors.review_status
                END,
                updated_at = excluded.updated_at
        `)
        const aliasUpsert = this.db.prepare(`
            INSERT INTO author_aliases(
                alias_key, alias_display, author_id, source, evidence,
                confidence, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(alias_key) DO UPDATE SET
                alias_display = excluded.alias_display,
                evidence = excluded.evidence,
                confidence = MIN(author_aliases.confidence, excluded.confidence)
        `)
        const comicUpsert = this.db.prepare(`
            INSERT INTO comics(
                id, title, raw_author, circle, author_candidate,
                canonical_author_id, description, chinese_team,
                categories_json, tags_json, finished, created_at_source,
                updated_at_source, total_likes, total_views, pages_count,
                eps_count, is_favorite, first_seen_at, last_seen_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                title = excluded.title,
                raw_author = excluded.raw_author,
                circle = excluded.circle,
                author_candidate = excluded.author_candidate,
                canonical_author_id = excluded.canonical_author_id,
                description = excluded.description,
                chinese_team = excluded.chinese_team,
                categories_json = excluded.categories_json,
                tags_json = excluded.tags_json,
                finished = excluded.finished,
                created_at_source = COALESCE(excluded.created_at_source, comics.created_at_source),
                updated_at_source = COALESCE(excluded.updated_at_source, comics.updated_at_source),
                total_likes = excluded.total_likes,
                total_views = excluded.total_views,
                pages_count = excluded.pages_count,
                eps_count = excluded.eps_count,
                is_favorite = CASE
                    WHEN excluded.is_favorite = 1 THEN 1
                    ELSE comics.is_favorite
                END,
                last_seen_at = excluded.last_seen_at
        `)
        const linkUpsert = this.db.prepare(`
            INSERT INTO comic_authors(
                comic_id, author_id, raw_value, circle, confidence,
                needs_review, evidence
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(comic_id, author_id, raw_value) DO UPDATE SET
                circle = excluded.circle,
                confidence = excluded.confidence,
                needs_review = excluded.needs_review,
                evidence = excluded.evidence
        `)

        let inserted = 0
        let updated = 0
        try {
            this.db.exec('BEGIN IMMEDIATE')
            if (completeSnapshot && markFavorite) {
                this.db.exec('UPDATE comics SET is_favorite = 0')
            }
            for (const record of records) {
                const existed = Boolean(
                    existsStatement.get(record.comicId) as SqlRow | undefined
                )
                const identity = parseAuthorIdentity(record.author)
                let authorId: string | null = null
                if (identity.normalizedKey !== '(missing)') {
                    const existingAlias = aliasLookup.get(
                        identity.normalizedKey
                    ) as SqlRow | undefined
                    authorId = existingAlias
                        ? String(existingAlias.author_id)
                        : authorIdForKey(identity.normalizedKey)
                    authorUpsert.run(
                        authorId,
                        identity.creator,
                        identity.normalizedKey,
                        identity.confidence,
                        identity.evidence,
                        identity.needsReview ? 'pending' : 'approved',
                        now,
                        now
                    )
                    aliasUpsert.run(
                        identity.normalizedKey,
                        identity.creator,
                        authorId,
                        identity.parsed ? 'parenthetical' : 'standalone',
                        identity.evidence,
                        identity.confidence,
                        now
                    )
                }
                comicUpsert.run(
                    record.comicId,
                    record.title.trim(),
                    record.author,
                    identity.circle,
                    identity.creator === '(missing)' ? null : identity.creator,
                    authorId,
                    record.description ?? '',
                    record.chineseTeam ?? '',
                    JSON.stringify(record.categories),
                    JSON.stringify(record.tags),
                    record.finished ? 1 : 0,
                    record.createdAt ?? null,
                    record.updatedAt ?? null,
                    record.totalLikes ?? 0,
                    record.totalViews ?? 0,
                    record.pagesCount ?? 0,
                    record.epsCount ?? 0,
                    markFavorite ? 1 : 0,
                    now,
                    now
                )
                if (authorId) {
                    linkUpsert.run(
                        record.comicId,
                        authorId,
                        record.author,
                        identity.circle,
                        identity.confidence,
                        identity.needsReview ? 1 : 0,
                        identity.evidence
                    )
                }
                if (existed) updated += 1
                else inserted += 1
            }
            this.db
                .prepare(
                    `UPDATE sync_runs SET status = 'completed', finished_at = ?,
                     item_count = ? WHERE id = ?`
                )
                .run(new Date().toISOString(), records.length, runId)
            this.db.exec('COMMIT')
        } catch (error) {
            this.db.exec('ROLLBACK')
            this.db
                .prepare(
                    `UPDATE sync_runs SET status = 'failed', finished_at = ?,
                     error = ? WHERE id = ?`
                )
                .run(new Date().toISOString(), String(error), runId)
            throw error
        }

        const summary = this.summary()
        return {
            imported: records.length,
            inserted,
            updated,
            authorGroups: summary.authors,
            authorsPendingReview: summary.authorsPendingReview
        }
    }

    importCatalog(records: FavoriteRecord[], source = 'catalog'): ImportResult {
        return this.importFavorites(records, source, false, false)
    }

    summary(): LibrarySummary {
        const count = (sql: string) =>
            numberValue((this.db.prepare(sql).get() as SqlRow).count)
        return {
            comics: count('SELECT COUNT(*) AS count FROM comics'),
            favorites: count(
                'SELECT COUNT(*) AS count FROM comics WHERE is_favorite = 1'
            ),
            authors: count('SELECT COUNT(*) AS count FROM authors'),
            authorsPendingReview: count(
                `SELECT COUNT(*) AS count FROM authors WHERE review_status = 'pending'`
            ),
            episodes: count('SELECT COUNT(*) AS count FROM episodes'),
            pictures: count('SELECT COUNT(*) AS count FROM pictures'),
            downloadedPictures: count(
                `SELECT COUNT(*) AS count FROM pictures WHERE status = 'completed'`
            )
        }
    }

    listComics(query: ComicQuery = {}): StoredComic[] {
        const rows = this.db
            .prepare(
                `SELECT c.*, a.canonical_name,
                        (SELECT COUNT(*) FROM episodes e WHERE e.comic_id = c.id)
                            AS known_episodes,
                        (SELECT COUNT(*) FROM pictures p WHERE p.comic_id = c.id)
                            AS known_pictures,
                        (SELECT COUNT(*) FROM pictures p
                         WHERE p.comic_id = c.id AND p.status = 'completed')
                            AS downloaded_pictures
                 FROM comics c
                 LEFT JOIN authors a ON a.id = c.canonical_author_id`
            )
            .all() as SqlRow[]
        const text = query.text?.toLocaleLowerCase('und').trim()
        const author = query.author
            ? normalizeAuthorKey(query.author)
            : undefined
        const tags = query.tags?.map((tag) => normalizeAuthorKey(tag)) ?? []
        const categories =
            query.categories?.map((category) => normalizeAuthorKey(category)) ??
            []

        const comics = rows
            .map((row): StoredComic => {
                const canonicalAuthor = row.canonical_name
                    ? String(row.canonical_name)
                    : null
                return {
                    comicId: String(row.id),
                    title: String(row.title),
                    author: String(row.raw_author),
                    description: String(row.description ?? ''),
                    chineseTeam: String(row.chinese_team ?? ''),
                    categories: jsonArray(row.categories_json),
                    tags: jsonArray(row.tags_json),
                    finished: Boolean(row.finished),
                    createdAt: row.created_at_source
                        ? String(row.created_at_source)
                        : undefined,
                    updatedAt: row.updated_at_source
                        ? String(row.updated_at_source)
                        : undefined,
                    totalLikes: numberValue(row.total_likes),
                    totalViews: numberValue(row.total_views),
                    pagesCount: numberValue(row.pages_count),
                    epsCount: numberValue(row.eps_count),
                    canonicalAuthor,
                    circle: row.circle ? String(row.circle) : null,
                    authorId: row.canonical_author_id
                        ? String(row.canonical_author_id)
                        : null,
                    isFavorite: Boolean(row.is_favorite),
                    firstSeenAt: String(row.first_seen_at),
                    lastSeenAt: String(row.last_seen_at),
                    knownEpisodes: numberValue(row.known_episodes),
                    knownPictures: numberValue(row.known_pictures),
                    downloadedPictures: numberValue(row.downloaded_pictures)
                }
            })
            .filter((comic) => {
                if (
                    query.finished !== undefined &&
                    comic.finished !== query.finished
                )
                    return false
                if (
                    text &&
                    ![
                        comic.title,
                        comic.author,
                        comic.canonicalAuthor ?? '',
                        comic.description ?? ''
                    ]
                        .join('\n')
                        .toLocaleLowerCase('und')
                        .includes(text)
                )
                    return false
                if (
                    author &&
                    normalizeAuthorKey(
                        comic.canonicalAuthor ?? comic.author
                    ) !== author
                )
                    return false
                const comicTags = comic.tags.map(normalizeAuthorKey)
                if (tags.some((tag) => !comicTags.includes(tag))) return false
                const comicCategories = comic.categories.map(normalizeAuthorKey)
                if (
                    categories.some(
                        (category) => !comicCategories.includes(category)
                    )
                )
                    return false
                return true
            })

        const sort = query.sort ?? 'latest'
        comics.sort((left, right) => {
            if (sort === 'oldest')
                return String(left.updatedAt ?? '').localeCompare(
                    String(right.updatedAt ?? '')
                )
            if (sort === 'likes')
                return (right.totalLikes ?? 0) - (left.totalLikes ?? 0)
            if (sort === 'views')
                return (right.totalViews ?? 0) - (left.totalViews ?? 0)
            if (sort === 'title') return left.title.localeCompare(right.title)
            if (sort === 'recommended') {
                const score = (comic: StoredComic) =>
                    Math.log10(1 + (comic.totalLikes ?? 0)) * 3 +
                    Math.log10(1 + (comic.totalViews ?? 0)) +
                    tags.filter((tag) =>
                        comic.tags.map(normalizeAuthorKey).includes(tag)
                    ).length *
                        5
                return score(right) - score(left)
            }
            return String(right.updatedAt ?? '').localeCompare(
                String(left.updatedAt ?? '')
            )
        })
        const offset = Math.max(0, query.offset ?? 0)
        const limit = Math.max(1, Math.min(5000, query.limit ?? 100))
        return comics.slice(offset, offset + limit)
    }

    listAuthors(): AuthorGroup[] {
        const rows = this.db
            .prepare(
                `SELECT a.*,
                        COUNT(DISTINCT ca.comic_id) AS works
                 FROM authors a
                 LEFT JOIN comic_authors ca ON ca.author_id = a.id
                 GROUP BY a.id
                 ORDER BY works DESC, a.canonical_name ASC`
            )
            .all() as SqlRow[]
        const aliases = this.db.prepare(
            `SELECT alias_display FROM author_aliases
             WHERE author_id = ? ORDER BY alias_display`
        )
        const circles = this.db.prepare(
            `SELECT DISTINCT circle FROM comic_authors
             WHERE author_id = ? AND circle IS NOT NULL AND circle <> ''
             ORDER BY circle`
        )
        return rows.map((row) => ({
            id: String(row.id),
            canonicalName: String(row.canonical_name),
            normalizedKey: String(row.normalized_key),
            aliases: (aliases.all(String(row.id)) as SqlRow[]).map((item) =>
                String(item.alias_display)
            ),
            circles: (circles.all(String(row.id)) as SqlRow[]).map((item) =>
                String(item.circle)
            ),
            works: numberValue(row.works),
            confidence: numberValue(row.confidence),
            evidence: String(row.evidence),
            reviewStatus: String(row.review_status)
        }))
    }

    setAuthorDecision(
        authorId: string,
        reviewStatus: 'approved' | 'keep_separate' | 'needs_research',
        canonicalName?: string
    ) {
        const now = new Date().toISOString()
        const result = this.db
            .prepare(
                `UPDATE authors
                 SET review_status = ?, canonical_name = COALESCE(?, canonical_name),
                     updated_at = ?
                 WHERE id = ?`
            )
            .run(reviewStatus, canonicalName?.trim() || null, now, authorId)
        if (result.changes === 0) throw new Error(`Unknown author: ${authorId}`)
    }

    mergeAuthors(
        targetAuthorId: string,
        sourceAuthorIds: string[],
        canonicalName?: string
    ) {
        const sources = [...new Set(sourceAuthorIds)].filter(
            (id) => id && id !== targetAuthorId
        )
        if (sources.length === 0) {
            throw new Error('At least one different source author is required')
        }
        const target = this.db
            .prepare('SELECT id FROM authors WHERE id = ?')
            .get(targetAuthorId)
        if (!target) throw new Error(`Unknown target author: ${targetAuthorId}`)

        const now = new Date().toISOString()
        const copyLinks = this.db.prepare(`
            INSERT OR IGNORE INTO comic_authors(
                comic_id, author_id, raw_value, circle, role, is_primary,
                confidence, needs_review, evidence
            )
            SELECT comic_id, ?, raw_value, circle, role, is_primary,
                   confidence, 0, evidence || '; manually merged'
            FROM comic_authors WHERE author_id = ?
        `)
        const moveComics = this.db.prepare(
            'UPDATE comics SET canonical_author_id = ? WHERE canonical_author_id = ?'
        )
        const moveAliases = this.db.prepare(
            'UPDATE author_aliases SET author_id = ? WHERE author_id = ?'
        )
        const deleteLinks = this.db.prepare(
            'DELETE FROM comic_authors WHERE author_id = ?'
        )
        const deleteAuthor = this.db.prepare('DELETE FROM authors WHERE id = ?')

        this.db.exec('BEGIN IMMEDIATE')
        try {
            for (const sourceId of sources) {
                const source = this.db
                    .prepare('SELECT id FROM authors WHERE id = ?')
                    .get(sourceId)
                if (!source)
                    throw new Error(`Unknown source author: ${sourceId}`)
                copyLinks.run(targetAuthorId, sourceId)
                moveComics.run(targetAuthorId, sourceId)
                moveAliases.run(targetAuthorId, sourceId)
                deleteLinks.run(sourceId)
                deleteAuthor.run(sourceId)
            }
            this.db
                .prepare(
                    `UPDATE authors SET canonical_name = COALESCE(?, canonical_name),
                     review_status = 'approved', confidence = 1,
                     evidence = evidence || '; manually approved merge',
                     updated_at = ? WHERE id = ?`
                )
                .run(canonicalName?.trim() || null, now, targetAuthorId)
            this.db.exec('COMMIT')
        } catch (error) {
            this.db.exec('ROLLBACK')
            throw error
        }
        return this.listAuthors().find((author) => author.id === targetAuthorId)
    }

    applyAuthorDictionary(
        entries: Array<{ canonicalName: string; aliases: string[] }>
    ) {
        let applied = 0
        let merged = 0
        for (const entry of entries) {
            const ids = [entry.canonicalName, ...(entry.aliases ?? [])]
                .map(normalizeAuthorKey)
                .flatMap((key) => {
                    const row = this.db
                        .prepare(
                            'SELECT author_id FROM author_aliases WHERE alias_key = ?'
                        )
                        .get(key) as SqlRow | undefined
                    return row ? [String(row.author_id)] : []
                })
            const uniqueIds = [...new Set(ids)]
            if (uniqueIds.length === 0) continue
            const [targetId, ...sourceIds] = uniqueIds
            if (sourceIds.length > 0) {
                this.mergeAuthors(targetId, sourceIds, entry.canonicalName)
                merged += sourceIds.length
            } else {
                this.setAuthorDecision(
                    targetId,
                    'approved',
                    entry.canonicalName
                )
            }
            applied += 1
        }
        return { entries: entries.length, applied, merged }
    }

    upsertEpisode(episode: {
        id: string
        comicId: string
        title: string
        order: number
        updatedAt?: string
    }) {
        const now = new Date().toISOString()
        this.db
            .prepare(
                `INSERT INTO episodes(
                    id, comic_id, title, order_no, updated_at_source,
                    first_seen_at, last_seen_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    title = excluded.title,
                    order_no = excluded.order_no,
                    updated_at_source = excluded.updated_at_source,
                    last_seen_at = excluded.last_seen_at`
            )
            .run(
                episode.id,
                episode.comicId,
                episode.title,
                episode.order,
                episode.updatedAt ?? null,
                now,
                now
            )
    }

    upsertPicture(picture: {
        id: string
        comicId: string
        episodeId: string
        position: number
        originalName: string
        mediaPath: string
        fileServer: string
    }) {
        const now = new Date().toISOString()
        this.db
            .prepare(
                `INSERT INTO pictures(
                    id, comic_id, episode_id, position, original_name,
                    media_path, file_server, first_seen_at, last_seen_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    position = excluded.position,
                    original_name = excluded.original_name,
                    media_path = excluded.media_path,
                    file_server = excluded.file_server,
                    last_seen_at = excluded.last_seen_at`
            )
            .run(
                picture.id,
                picture.comicId,
                picture.episodeId,
                picture.position,
                picture.originalName,
                picture.mediaPath,
                picture.fileServer,
                now,
                now
            )
    }

    pictureDownloadState(pictureId: string) {
        const row = this.db
            .prepare(
                `SELECT status, local_path, byte_size, sha256
                 FROM pictures WHERE id = ?`
            )
            .get(pictureId) as SqlRow | undefined
        if (!row) return null
        return {
            status: String(row.status),
            localPath: row.local_path ? String(row.local_path) : null,
            byteSize: numberValue(row.byte_size),
            sha256: row.sha256 ? String(row.sha256) : null
        }
    }

    markPictureDownloaded(
        pictureId: string,
        localPath: string,
        byteSize: number,
        sha256: string
    ) {
        this.db
            .prepare(
                `UPDATE pictures SET status = 'completed', local_path = ?,
                 byte_size = ?, sha256 = ? WHERE id = ?`
            )
            .run(localPath, byteSize, sha256, pictureId)
    }
}
