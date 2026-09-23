import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const web = fileURLToPath(new URL('../web/', import.meta.url))
function javascriptFiles(directory) {
    const output = []
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const full = path.join(directory, entry.name)
        if (entry.isDirectory()) output.push(...javascriptFiles(full))
        else if (entry.isFile() && entry.name.endsWith('.js')) output.push(full)
    }
    return output
}

const files = javascriptFiles(web).sort()
if (!files.length) throw new Error('No Web modules found')
for (const file of files) {
    const result = spawnSync(
        process.execPath,
        ['--check', file],
        { stdio: 'inherit' }
    )
    if (result.error || result.status !== 0) process.exit(result.status || 1)
}
console.log(`Web syntax: ${files.length}/${files.length} modules passed`)
