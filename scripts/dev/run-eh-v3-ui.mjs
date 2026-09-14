import fs from 'node:fs'
import { pathToFileURL } from 'node:url'

function replaceOnce(text, search, replacement, label) {
    const first = text.indexOf(search)
    if (first < 0) throw new Error(`Missing ${label}`)
    if (text.indexOf(search, first + search.length) >= 0)
        throw new Error(`Duplicate ${label}`)
    return text.slice(0, first) + replacement + text.slice(first + search.length)
}

const sourceFile = 'scripts/dev/apply-eh-v3-ui.mjs'
let source = fs.readFileSync(sourceFile, 'utf8')
const badStart = source.indexOf("  text = replaceOnce(text,\n`>${'${t(\\'result.favorite\\')}'}")
const badEnd = source.indexOf("  write(file, text)\n}", badStart)
if (badStart < 0 || badEnd < 0)
    throw new Error('Could not isolate result favorite patch')
source = source.slice(0, badStart) + source.slice(badEnd)
const generated = '/tmp/pica-eh-v3-ui-patch.mjs'
fs.writeFileSync(generated, source)
await import(pathToFileURL(generated).href + `?v=${Date.now()}`)

// Scope the favorite-label replacement to search/recommendation cards only.
{
    const file = 'web/app.js'
    let app = fs.readFileSync(file, 'utf8')
    const start = app.indexOf('function renderResultCards(')
    const end = app.indexOf('function renderPreparedRecommendations()', start)
    if (start < 0 || end < 0) throw new Error('Result renderer scope not found')
    let renderer = app.slice(start, end)
    const oldValue = ">${t('result.favorite')}</button>"
    const newValue = ">${escapeHtml(providerFavoriteLabel(comic))}</button>"
    const first = renderer.indexOf(oldValue)
    if (first < 0 || renderer.indexOf(oldValue, first + oldValue.length) >= 0)
        throw new Error('Result favorite label is not unique inside renderer')
    renderer = renderer.slice(0, first) + newValue + renderer.slice(first + oldValue.length)
    app = app.slice(0, start) + renderer + app.slice(end)
    app = app.replace("'公开元数据'", "t('provider.publicMetadata')")
    app = app.replace("'本地收藏'", "t('provider.localFavorite')")
    fs.writeFileSync(file, app)
}

// listComics must actually project provider metadata from the LEFT JOIN.
{
    const file = 'src/library/database.ts'
    let text = fs.readFileSync(file, 'utf8')
    text = replaceOnce(
        text,
`                \`SELECT c.*, a.canonical_name,
                        EXISTS(SELECT 1 FROM library_membership lm
`,
`                \`SELECT c.*, a.canonical_name,
                        pm.provider_id, pm.provider_remote_id,
                        pm.alternate_titles_json, pm.completion_status,
                        pm.rating, pm.provider_metadata_json,
                        EXISTS(SELECT 1 FROM library_membership lm
`,
        'provider metadata projection'
    )
    fs.writeFileSync(file, text)
}

// Keep new provider UI fully localized.
{
    const file = 'web/i18n.js'
    let text = fs.readFileSync(file, 'utf8')
    text = replaceOnce(
        text,
`        'result.favorite': 'Add to Pica favorites',
`,
`        'result.favorite': 'Add to Pica favorites',
        'provider.publicMetadata': 'Public metadata',
        'provider.localFavorite': 'Save locally',
`,
        'English provider strings'
    )
    text = replaceOnce(
        text,
`        'result.favorite': '加入 Pica 收藏',
`,
`        'result.favorite': '加入 Pica 收藏',
        'provider.publicMetadata': '公开元数据',
        'provider.localFavorite': '本地收藏',
`,
        'Chinese provider strings'
    )
    fs.writeFileSync(file, text)
}

console.log('EH_V3_UI_SCOPED_PATCH=APPLIED')
