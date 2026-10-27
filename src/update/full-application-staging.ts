import fs from 'node:fs'
import path from 'node:path'
import type { validateFullApplicationArchive } from './full-archive'

/** Shared byte extraction only. Does not replace installations, stop processes or touch profiles. */
export function extractValidatedFullApplication(
    validated: ReturnType<typeof validateFullApplicationArchive>,
    directory: string,
    progress: (current: number, total: number) => void = () => {}
) {
    // A staging collision is never permission to reuse/overwrite a recovery tree.
    fs.mkdirSync(directory, { recursive: false })
    let current = 0
    progress(current, validated.declared.size)
    for (const [safe, entry] of validated.declared) {
        const destination = path.join(directory, ...safe.split('/'))
        fs.mkdirSync(path.dirname(destination), { recursive: true })
        fs.writeFileSync(destination, entry.getData(), { flag: 'wx' })
        progress(++current, validated.declared.size)
    }
}
