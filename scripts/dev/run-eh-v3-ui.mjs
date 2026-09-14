import fs from 'node:fs'
import { pathToFileURL } from 'node:url'

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
fs.writeFileSync(file, app)
console.log('EH_V3_UI_SCOPED_PATCH=APPLIED')
