import fs from 'node:fs'
import { pathToFileURL } from 'node:url'

const sourceFile = 'scripts/dev/apply-eh-desktop-v1.mjs'
let source = fs.readFileSync(sourceFile, 'utf8')

function stripBlock(startMarker, endMarker, label) {
    const start = source.indexOf(startMarker)
    const end = source.indexOf(endMarker, start)
    if (start < 0 || end < 0)
        throw new Error(`Could not isolate ${label}`)
    source = source.slice(0, start) + source.slice(end)
}

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
