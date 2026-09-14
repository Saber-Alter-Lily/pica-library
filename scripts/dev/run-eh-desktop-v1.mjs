import fs from 'node:fs'
import { pathToFileURL } from 'node:url'

const sourceFile = 'scripts/dev/apply-eh-desktop-v1.mjs'
let source = fs.readFileSync(sourceFile, 'utf8')
const start = source.indexOf("  text = replaceOnce(text,\n`            const comic = item.comic || item")
const end = source.indexOf("  write(file, text)\n}\n\nconsole.log('EH_DESKTOP_V1_PATCH=APPLIED')", start)
if (start < 0 || end < 0) throw new Error('Could not isolate the optional result-card patch block')
source = source.slice(0, start) + source.slice(end)
const generated = '/tmp/pica-eh-desktop-patch.mjs'
fs.writeFileSync(generated, source)
await import(pathToFileURL(generated).href + `?v=${Date.now()}`)
