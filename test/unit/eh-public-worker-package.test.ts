import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash, generateKeyPairSync, sign } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { buildEhPublicWorkerCandidate } from '../../scripts/build-eh-public-worker-candidate'
import {
    SignedWorkerStore,
    sourceWorkerSignaturePayload
} from '../../src/source-extensions/signed-worker-store'

describe('S3 isolated E-H source package candidate (never publicly signed)', () => {
    it('builds deterministic single-file worker bytes with an audited, source-only dependency graph', async () => {
        const first = await buildEhPublicWorkerCandidate()
        const second = await buildEhPublicWorkerCandidate()
        expect(Buffer.from(first.bytes).equals(Buffer.from(second.bytes))).toBe(true)
        expect(first.release).toEqual(second.release)
        expect(first.release).toMatchObject({
            schemaVersion: 1,
            sourceId: 'eh-public-reader',
            version: '0.0.1',
            size: first.bytes.length,
            sha256: createHash('sha256').update(first.bytes).digest('hex')
        })
        expect(first.sourceInputs).toContain('src/providers/eh-provider.ts')
        expect(first.sourceInputs).toContain('src/source-extensions/workers/eh-public-worker.ts')
        expect(first.sourceInputs.some(file =>
            file.startsWith('node_modules/') ||
            file === 'src/sdk.ts' ||
            file === 'src/desktop/main.ts' ||
            file === 'src/providers/pica-provider.ts' ||
            file === 'src/providers/jm-provider.ts'
        )).toBe(false)
        expect(first.externalImports.every(name => name.startsWith('node:'))).toBe(true)
        expect(first.bytes.length).toBeGreaterThan(1000)
        expect(first.bytes.length).toBeLessThan(1024 * 1024)
        expect(fs.existsSync('.s3-unsigned-qa/worker.cjs')).toBe(false)
        // A newer source SDK or unapproved dependency cannot silently enter
        // the signed payload: the allowlist in the compiler must change first.
    }, 30_000)

    it('only becomes installable after a separately trusted publisher has signed the exact bytes', async () => {
        const candidate = await buildEhPublicWorkerCandidate()
        const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'eh-source-package-'))
        let store: SignedWorkerStore | undefined
        try {
            const publisher = generateKeyPairSync('ed25519')
            store = new SignedWorkerStore({
                root: path.join(folder, 'installed'),
                publisherPublicKeyPem: publisher.publicKey.export({
                    format: 'pem', type: 'spki'
                }).toString()
            })
            // An unsigned candidate is NOT a valid installed generation.
            expect(() => store!.install(candidate.release, candidate.bytes)).toThrow()
            expect(() => store!.state('eh-public-reader')).toThrow()
            const exactSignature = sign(
                null,
                sourceWorkerSignaturePayload(candidate.release),
                publisher.privateKey
            ).toString('base64')
            const release = { ...candidate.release, signature: exactSignature }
            expect(store.install(release, candidate.bytes))
                .toMatchObject({ installed: true, sourceId: 'eh-public-reader' })
            const installed = store.readInstalled('eh-public-reader', '0.0.1')
            expect(installed.release).toEqual(release)
            expect(store.state('eh-public-reader')).toMatchObject({
                activeVersion: null, revision: 0
            })
            expect(() => store!.install(release,
                Uint8Array.from(candidate.bytes, n => n ^ 1))).toThrow()
            // Even a fully verified install must not launch or enable a worker.
            expect(store.state('eh-public-reader').activeVersion).toBeNull()
        } finally {
            store?.close()
            const versions = path.join(folder, 'installed', 'eh-public-reader', 'versions')
            if (fs.existsSync(versions))
                for (const version of fs.readdirSync(versions))
                    for (const file of ['worker.cjs', 'release.json']) {
                        const location = path.join(versions, version, file)
                        if (fs.existsSync(location)) fs.chmodSync(location, 0o600)
                    }
            fs.rmSync(folder, {
                recursive: true, force: true, maxRetries: 20, retryDelay: 150
            })
        }
    }, 30_000)

    it.each(['0.0.1-qa', '01.0.0', '../0.0.1', '1.10000.0'])(
        'rejects non-V1 version %s before building a candidate',
        async value => {
            await expect(buildEhPublicWorkerCandidate(value)).rejects.toThrow(
                'three-part semver'
            )
        }
    )
})
