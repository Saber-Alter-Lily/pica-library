import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const target = path.join(root, 'scripts/apply-recommendation-v4-visual-feedback-dev.mjs')
let source = fs.readFileSync(target, 'utf8')

const replace = (from, to) => {
    if (!source.includes(from)) throw new Error(`Missing apply-script anchor: ${from.slice(0, 100)}`)
    source = source.replace(from, to)
}

replace(
    `insertBefore(\n    'src/storage/sqlite/migrations.ts',\n    "    }\\n]\\n\\nexport const latestMigrationVersion",\n    \`    },\\n    {\\n`,
    `insertBefore(\n    'src/storage/sqlite/migrations.ts',\n    "]\\n\\nexport const latestMigrationVersion",\n    \`,\\n    {\\n`
)

const stylesStart = source.indexOf('// Minimal styling; no diagnostic scores are exposed.')
const i18nStart = source.indexOf('// Translation keys used by dynamic V4 UI.')
if (stylesStart < 0 || i18nStart < 0 || i18nStart <= stylesStart)
    throw new Error('Unable to isolate style patch block')
source =
    source.slice(0, stylesStart) +
    '// Styling is applied by the post-integration hardening script.\n\n' +
    source.slice(i18nStart)

const translationStart = source.indexOf('// Translation keys used by dynamic V4 UI.')
const testsStart = source.indexOf('// Add explicit V4 contract tests')
if (translationStart < 0 || testsStart < 0 || testsStart <= translationStart)
    throw new Error('Unable to isolate translation patch block')
source =
    source.slice(0, translationStart) +
    '// Translation keys are applied by the post-integration hardening script.\n\n' +
    source.slice(testsStart)

fs.writeFileSync(target, source, 'utf8')
console.log('Hardened Recommendation V4 integration patch anchors')
