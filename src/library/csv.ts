import type { FavoriteRecord } from './types'

function csvCell(value: unknown) {
    const text = String(value ?? '')
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function parseCsv(text: string): string[][] {
    const source = text.replace(/^\uFEFF/, '')
    const rows: string[][] = []
    let row: string[] = []
    let cell = ''
    let quoted = false

    for (let index = 0; index < source.length; index += 1) {
        const char = source[index]
        if (quoted) {
            if (char === '"' && source[index + 1] === '"') {
                cell += '"'
                index += 1
            } else if (char === '"') {
                quoted = false
            } else {
                cell += char
            }
            continue
        }
        if (char === '"') {
            quoted = true
        } else if (char === ',') {
            row.push(cell)
            cell = ''
        } else if (char === '\n') {
            row.push(cell.replace(/\r$/, ''))
            if (row.some((value) => value.length > 0)) rows.push(row)
            row = []
            cell = ''
        } else {
            cell += char
        }
    }
    if (cell.length > 0 || row.length > 0) {
        row.push(cell.replace(/\r$/, ''))
        rows.push(row)
    }
    return rows
}

function splitList(value: string | undefined): string[] {
    return String(value ?? '')
        .split(/\s*\|\s*/)
        .map((item) => item.trim())
        .filter(Boolean)
}

function asBoolean(value: string | undefined): boolean {
    return ['true', '1', 'yes', 'finished'].includes(
        String(value ?? '')
            .trim()
            .toLocaleLowerCase('und')
    )
}

function asOptionalNumber(value: string | undefined): number | undefined {
    if (value === undefined || value.trim() === '') return undefined
    const number = Number(value)
    return Number.isFinite(number) ? number : undefined
}

function asOptionalString(value: string | undefined): string | undefined {
    return value === undefined || value.trim() === '' ? undefined : value
}

export function favoritesFromCsv(text: string): FavoriteRecord[] {
    const rows = parseCsv(text)
    if (rows.length === 0) return []
    const headers = rows[0].map((header) => header.trim())
    const index = new Map(headers.map((header, i) => [header, i]))
    const get = (row: string[], ...names: string[]) => {
        for (const name of names) {
            const column = index.get(name)
            if (column !== undefined) return row[column]
        }
        return undefined
    }

    return rows.slice(1).flatMap((row, rowIndex) => {
        const comicId = String(get(row, 'comic_id', '_id', 'id') ?? '').trim()
        const title = String(get(row, 'title') ?? '').trim()
        if (!comicId || !title) return []
        return [
            {
                position:
                    asOptionalNumber(get(row, 'position')) ?? rowIndex + 1,
                comicId,
                title,
                author: String(get(row, 'author', 'author_raw') ?? '').trim(),
                description: asOptionalString(get(row, 'description')),
                chineseTeam: asOptionalString(
                    get(row, 'chineseTeam', 'chinese_team')
                ),
                categories: splitList(get(row, 'categories')),
                tags: splitList(get(row, 'tags')),
                finished: asBoolean(get(row, 'finished')),
                createdAt: asOptionalString(get(row, 'created_at')),
                updatedAt: asOptionalString(get(row, 'updated_at')),
                totalLikes: asOptionalNumber(
                    get(row, 'totalLikes', 'total_likes', 'likesCount')
                ),
                totalViews: asOptionalNumber(
                    get(row, 'totalViews', 'total_views', 'viewsCount')
                ),
                pagesCount: asOptionalNumber(
                    get(row, 'pagesCount', 'pages_count')
                ),
                epsCount: asOptionalNumber(get(row, 'epsCount', 'eps_count'))
            }
        ]
    })
}

export function favoritesToCsv(records: FavoriteRecord[]): string {
    const headers = [
        'comic_id',
        'title',
        'author',
        'categories',
        'tags',
        'finished',
        'created_at',
        'updated_at',
        'total_likes',
        'total_views',
        'pages_count',
        'eps_count'
    ]
    const rows = records.map((record) => [
        record.comicId,
        record.title,
        record.author,
        record.categories.join(' | '),
        record.tags.join(' | '),
        record.finished,
        record.createdAt,
        record.updatedAt,
        record.totalLikes,
        record.totalViews,
        record.pagesCount,
        record.epsCount
    ])
    return [headers, ...rows]
        .map((row) => row.map(csvCell).join(','))
        .join('\r\n')
}
