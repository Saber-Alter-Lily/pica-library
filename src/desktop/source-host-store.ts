import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { SourceHostError } from '../source-hosts/contract'
import { sourceHostRegistry, type SourceHostRegistryStore } from '../source-hosts/connections'

/** Separate local config adapter; never a database, credential vault, source index or sync payload. */
export function sourceHostStore(file: string): SourceHostRegistryStore {
    const maxBytes = 64 * 1024
    return {
        load() {
            try {
                const stat = fs.lstatSync(file)
                if (!stat.isFile() || stat.size > maxBytes) throw new Error('Invalid local registry')
                const bytes = fs.readFileSync(file)
                if (bytes.length > maxBytes) throw new Error('Invalid local registry')
                return sourceHostRegistry(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)))
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
                // Never silently reset a damaged permission file or echo its bytes/path.
                throw new SourceHostError('SOURCE_HOST_STORAGE')
            }
        },
        save(value) {
            const data = JSON.stringify(sourceHostRegistry(value), null, 2) + '\n'
            if (Buffer.byteLength(data) > maxBytes) throw new SourceHostError('SOURCE_HOST_STORAGE')
            fs.mkdirSync(path.dirname(file), { recursive: true })
            const temporary = file + '.tmp-' + randomUUID()
            let created = false
            try {
                try { if (!fs.lstatSync(file).isFile()) throw new Error('Invalid registry') }
                catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
                // Exclusive random temporary slot: never follow/overwrite a stale symlink.
                fs.writeFileSync(temporary, data, { encoding: 'utf8', mode: 0o600, flag: 'wx' })
                created = true
                fs.renameSync(temporary, file)
            } catch { throw new SourceHostError('SOURCE_HOST_STORAGE') }
            finally { if (created && fs.existsSync(temporary)) fs.rmSync(temporary) }
        }
    }
}
