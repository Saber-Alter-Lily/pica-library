import fs from 'node:fs'
import { pathToFileURL } from 'node:url'

const sourceFile = 'scripts/dev/apply-eh-desktop-v1.mjs'
let source = fs.readFileSync(sourceFile, 'utf8')

function replaceExact(text, search, replacement, label) {
    const first = text.indexOf(search)
    if (first < 0) throw new Error(`Missing ${label}`)
    if (text.indexOf(search, first + search.length) >= 0)
        throw new Error(`Duplicate ${label}`)
    return text.slice(0, first) + replacement + text.slice(first + search.length)
}

function stripBlock(startMarker, endMarker, label) {
    const start = source.indexOf(startMarker)
    const end = source.indexOf(endMarker, start)
    if (start < 0 || end < 0)
        throw new Error(`Could not isolate ${label}`)
    source = source.slice(0, start) + source.slice(end)
}

// Preserve the exact legacy Pica download implementation. The generated
// provider-neutral downloader is used only for E-H IDs so existing download
// behavior, tests, retries and progress semantics remain unchanged.
const serviceFile = 'src/library/service.ts'
const originalService = fs.readFileSync(serviceFile, 'utf8')
const originalDownloadStart = originalService.indexOf(
    '    private async downloadComicNow('
)
const originalDownloadEnd = originalService.indexOf(
    '\n}\n\nexport function parseEpisodeSelection',
    originalDownloadStart
)
if (originalDownloadStart < 0 || originalDownloadEnd < 0)
    throw new Error('Could not preserve legacy Pica download implementation')
const originalPicaDownload = originalService
    .slice(originalDownloadStart, originalDownloadEnd)
    .replace(
        '    private async downloadComicNow(',
        '    private async downloadPicaComicNow('
    )

stripBlock(
    "// Online reader accepts provider-scoped E-H IDs without weakening legacy validation.\n",
    "// API exposes provider capabilities and source selection.\n",
    'online-reader patch block'
)

const cardStart = source.indexOf(
    "  text = replaceOnce(text,\n`            const comic = item.comic || item"
)
const cardEnd = source.indexOf(
    "  write(file, text)\n}\n\nconsole.log('EH_DESKTOP_V1_PATCH=APPLIED')",
    cardStart
)
if (cardStart < 0 || cardEnd < 0)
    throw new Error('Could not isolate the optional result-card patch block')
source = source.slice(0, cardStart) + source.slice(cardEnd)

source = source.replaceAll('${GALLERY_ORIGIN}', '\\${GALLERY_ORIGIN}')
const generated = '/tmp/pica-eh-desktop-patch.mjs'
fs.writeFileSync(generated, source)
await import(pathToFileURL(generated).href + `?v=${Date.now()}`)

// Restore Pica downloads as an exact compatibility path and leave the new
// provider-neutral downloader responsible only for E-H galleries.
{
    let text = fs.readFileSync(serviceFile, 'utf8')
    const patchedStart = text.indexOf('    private async downloadComicNow(')
    if (patchedStart < 0) throw new Error('Patched downloader missing')
    text =
        text.slice(0, patchedStart) +
        originalPicaDownload +
        '\n\n' +
        text.slice(patchedStart)
    const currentStart = text.indexOf('    private async downloadComicNow(')
    const bodyAnchor = '    ): Promise<DownloadResult> {\n'
    const body = text.indexOf(bodyAnchor, currentStart)
    if (body < 0) throw new Error('Patched downloader body missing')
    const insertion = body + bodyAnchor.length
    text =
        text.slice(0, insertion) +
        "        if (!comicId.startsWith('eh:'))\n            return this.downloadPicaComicNow(comicId, options)\n" +
        text.slice(insertion)
    fs.writeFileSync(serviceFile, text)
}

// Queue-only placeholder comics do not yet have a provider-metadata row. Count
// their deterministic legacy identity instead of undercounting reconciliation.
{
    const file = 'src/library/database.ts'
    let text = fs.readFileSync(file, 'utf8')
    text = replaceExact(
        text,
`            distinctProviderRawIds: count(
                'SELECT COUNT(DISTINCT provider_id || char(31) || provider_remote_id) AS count FROM comic_provider_metadata'
            ),
`,
`            distinctProviderRawIds: count(
                \`SELECT COUNT(DISTINCT
                    COALESCE(
                        pm.provider_id,
                        CASE WHEN c.id LIKE 'eh:%' THEN 'eh' ELSE 'pica' END
                    ) || char(31) ||
                    COALESCE(
                        pm.provider_remote_id,
                        CASE WHEN c.id LIKE 'eh:%' THEN substr(c.id, 4) ELSE c.id END
                    )
                ) AS count
                 FROM comics c
                 LEFT JOIN comic_provider_metadata pm ON pm.comic_id = c.id\`
            ),
`,
        'provider identity reconciliation query'
    )
    fs.writeFileSync(file, text)
}

// Migration 9 is an intentional additive schema contract. Keep the migration
// tests strict, but advance their expected latest version and backup filename.
{
    const file = 'test/integration/migrations.test.ts'
    let text = fs.readFileSync(file, 'utf8')
    text = replaceExact(
        text,
        '            1, 2, 3, 4, 5, 6, 7, 8\n',
        '            1, 2, 3, 4, 5, 6, 7, 8, 9\n',
        'fresh migration version list'
    )
    text = replaceExact(
        text,
        '        ).toMatchObject({ count: 8 })\n',
        '        ).toMatchObject({ count: 9 })\n',
        'unversioned migration count'
    )
    text = replaceExact(
        text,
        '        const backup = `${databaseFile}.pre-migration-v8.bak`\n',
        '        const backup = `${databaseFile}.pre-migration-v9.bak`\n',
        'migration backup filename'
    )
    text = replaceExact(
        text,
        '        ).toMatchObject({ version: 8 })\n',
        '        ).toMatchObject({ version: 9 })\n',
        'public migration version'
    )
    fs.writeFileSync(file, text)
}

{
    const file = 'test/unit/recommendation-v3-final.test.ts'
    let text = fs.readFileSync(file, 'utf8')
    text = replaceExact(
        text,
        '            expect(latestMigrationVersion).toBe(8)\n',
        '            expect(latestMigrationVersion).toBe(9)\n',
        'recommendation schema version contract'
    )
    fs.writeFileSync(file, text)
}

console.log('EH_DESKTOP_V1_POSTPATCH=APPLIED')
