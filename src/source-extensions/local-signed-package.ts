import fs from 'node:fs'
import path from 'node:path'
import AdmZip from 'adm-zip'
import type { SignedWorkerStore } from './signed-worker-store'

/**
 * User-selected ZIP containing ONLY the existing Ed25519 release.json and
 * one worker.cjs. The native file picker belongs to trusted Desktop code;
 * the browser cannot supply a filename, worker, signature or public key.
 * Installing never enables or executes the source.
 */
export class LocalSignedSourceInstaller {
    constructor(
        private readonly store: SignedWorkerStore,
        private readonly chooseArchive: () => Promise<string | null>
    ) {}

    async installChosen() {
        const selected = await this.chooseArchive()
        if (selected === null) return { cancelled: true as const }
        if (typeof selected !== 'string' || !path.isAbsolute(selected) ||
            path.extname(selected).toLowerCase() !== '.zip')
            throw new Error('Invalid signed source archive selection')
        const info = fs.lstatSync(selected)
        if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 ||
            info.size < 1 || info.size > 1280 * 1024)
            throw new Error('Invalid signed source archive file')

        const archive = new AdmZip(fs.readFileSync(selected))
        const entries = archive.getEntries()
        if (entries.length !== 2 ||
            entries.some(entry => entry.isDirectory ||
                !['release.json', 'worker.cjs'].includes(entry.entryName)) ||
            new Set(entries.map(entry => entry.entryName)).size !== 2)
            throw new Error('Signed source ZIP must contain release.json and worker.cjs')
        const metadata = entries.find(entry => entry.entryName === 'release.json')!
        const worker = entries.find(entry => entry.entryName === 'worker.cjs')!
        if (metadata.header.size < 1 || metadata.header.size > 4096 ||
            worker.header.size < 1 || worker.header.size > 1024 * 1024)
            throw new Error('Signed source ZIP content exceeds limits')
        const releaseBytes = metadata.getData()
        const workerBytes = worker.getData()
        if (releaseBytes.length !== metadata.header.size ||
            workerBytes.length !== worker.header.size)
            throw new Error('Signed source ZIP size mismatch')
        // The existing store validates exact signed metadata, publisher
        // Ed25519 key, content SHA, immutable generations and no auto-enable.
        const release: unknown = JSON.parse(releaseBytes.toString('utf8'))
        return this.store.install(release, workerBytes)
    }
}
