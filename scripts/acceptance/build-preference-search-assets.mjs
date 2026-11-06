import fs from 'node:fs'
import { createHash } from 'node:crypto'
import dictionaries from 'opencc-js/to/cn'

// Reuse the exact pinned Desktop OpenCC data. This is search-only; no preference IDs change.
const mappings = new Map()
for (const dictionary of dictionaries) {
    for (const row of dictionary.split('|')) {
        const [from, to] = row.split(' ')
        mappings.set(from, to)
    }
}
const root = 'mobile/android-alpha2/app/src/main/assets/preference-search'
fs.mkdirSync(root, { recursive: true })
const payload =
    JSON.stringify({
        version: 'opencc-js-1.0.5-t2cn-search-v1',
        mappings: [...mappings]
    }) + '\n'
fs.writeFileSync(`${root}/t2cn.json`, payload)
fs.copyFileSync(
    'node_modules/opencc-js/LICENSE',
    `${root}/OPENCC_JS_LICENSE.txt`
)
fs.copyFileSync(
    'docs/licenses/OPENCC_DATA.txt',
    `${root}/OPENCC_DATA_LICENSE.txt`
)
console.log(
    JSON.stringify({
        entries: mappings.size,
        bytes: Buffer.byteLength(payload),
        sha256: createHash('sha256').update(payload).digest('hex')
    })
)
