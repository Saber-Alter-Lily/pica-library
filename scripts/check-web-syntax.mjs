import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const web = fileURLToPath(new URL('../web/', import.meta.url))
const files = fs
    .readdirSync(web)
    .filter((file) => file.endsWith('.js'))
    .sort()
if (!files.length) throw new Error('No Web modules found')
for (const file of files) {
    const result = spawnSync(
        process.execPath,
        ['--check', path.join(web, file)],
        { stdio: 'inherit' }
    )
    if (result.error || result.status !== 0) process.exit(result.status || 1)
}
console.log(`Web syntax: ${files.length}/${files.length} modules passed`)
