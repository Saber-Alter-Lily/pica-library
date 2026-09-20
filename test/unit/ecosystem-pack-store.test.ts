import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import {
    computePackContentRoot,
    type EcosystemPackFile
} from '../../src/ecosystem/pack-manifest'
import {
    EcosystemPackStore,
    appVersionSatisfiesMinimum
} from '../../src/ecosystem/pack-store'

const roots: string[] = []

afterEach(() => {
    for (const root of roots.splice(0))
        fs.rmSync(root, { recursive: true, force: true })
})

function sha256(value: Buffer) {
    return createHash('sha256').update(value).digest('hex')
}

function makePack(options?: {
    minimumAppVersion?: string
    extraPayload?: boolean
    packDirectory?: string
    manifestPackId?: string
}) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-pack-store-'))
    roots.push(root)

    const packId =
        options?.packDirectory ?? 'org.picalibrary.canonical.default'
    const generation = '2026.09.19.1'
    const generationRoot = path.join(root, packId, generation)
    fs.mkdirSync(path.join(generationRoot, 'payload'), { recursive: true })

    const payload = Buffer.from('{"work":"example"}\n', 'utf8')
    const payloadPath = path.join(generationRoot, 'payload', 'works.ndjson')
    fs.writeFileSync(payloadPath, payload)
    if (options?.extraPayload)
        fs.writeFileSync(
            path.join(generationRoot, 'payload', 'undeclared.txt'),
            'not declared',
            'utf8'
        )

    const files: EcosystemPackFile[] = [
        {
            path: 'payload/works.ndjson',
            sha256: sha256(payload),
            size: payload.byteLength
        }
    ]
    const manifest = {
        schemaVersion: 1,
        packId: options?.manifestPackId ?? packId,
        packType: 'CANONICAL_KNOWLEDGE',
        generation,
        createdAt: '2026-09-19T00:00:00.000Z',
        minimumAppVersion: options?.minimumAppVersion ?? '0.5.0',
        contentLicense: 'CC0-1.0',
        publisher: { id: 'org.picalibrary' },
        dependencies: [],
        files,
        contentRootSha256: computePackContentRoot(files)
    }
    fs.writeFileSync(
        path.join(generationRoot, 'pack.json'),
        JSON.stringify(manifest, null, 2),
        'utf8'
    )
    return { root, generationRoot, payloadPath }
}

describe('read-only Recommendation Ecosystem Pack inventory', () => {
    it('returns an empty inventory when no Pack root exists', () => {
        const root = path.join(
            os.tmpdir(),
            'missing-pica-pack-' + String(Date.now())
        )
        expect(new EcosystemPackStore(root, '0.5.0').inventory()).toEqual([])
    })

    it('validates payload bytes and reports compatible local unsigned Packs', () => {
        const value = makePack()
        expect(
            new EcosystemPackStore(value.root, '0.5.0').inventory()
        ).toEqual([
            expect.objectContaining({
                packId: 'org.picalibrary.canonical.default',
                generation: '2026.09.19.1',
                packType: 'CANONICAL_KNOWLEDGE',
                trust: 'LOCAL_UNSIGNED',
                integrity: 'VALID',
                compatible: true,
                minimumAppVersion: '0.5.0',
                contentLicense: 'CC0-1.0',
                fileCount: 1
            })
        ])
    })

    it('marks a valid Pack incompatible when the application is too old', () => {
        const value = makePack({ minimumAppVersion: '0.6.0' })
        expect(
            new EcosystemPackStore(value.root, '0.5.0').inventory()[0]
        ).toMatchObject({
            integrity: 'VALID',
            compatible: false,
            minimumAppVersion: '0.6.0'
        })
    })

    it('reports tampered payload bytes as invalid without throwing the inventory scan', () => {
        const value = makePack()
        fs.writeFileSync(value.payloadPath, 'tampered', 'utf8')
        const item = new EcosystemPackStore(value.root, '0.5.0').inventory()[0]
        expect(item).toMatchObject({
            integrity: 'INVALID',
            compatible: false
        })
        expect(item.error).toMatch(/size mismatch|SHA-256 mismatch/)
    })

    it('rejects undeclared payload files and directory identity mismatch', () => {
        const extra = makePack({ extraPayload: true })
        expect(
            new EcosystemPackStore(extra.root, '0.5.0').inventory()[0]
        ).toMatchObject({
            integrity: 'INVALID',
            error: 'Pack payload files do not match the manifest'
        })

        const mismatch = makePack({
            packDirectory: 'org.picalibrary.canonical.directory',
            manifestPackId: 'org.picalibrary.canonical.other'
        })
        expect(
            new EcosystemPackStore(mismatch.root, '0.5.0').inventory()[0]
        ).toMatchObject({
            integrity: 'INVALID',
            error: 'Pack ID does not match its directory'
        })
    })

    it('compares minimum application versions by numeric semver core', () => {
        expect(appVersionSatisfiesMinimum('0.5.0', '0.5.0')).toBe(true)
        expect(appVersionSatisfiesMinimum('0.5.1', '0.5.0')).toBe(true)
        expect(appVersionSatisfiesMinimum('0.5.0-beta.1', '0.5.0')).toBe(true)
        expect(appVersionSatisfiesMinimum('0.4.99', '0.5.0')).toBe(false)
        expect(appVersionSatisfiesMinimum('not-a-version', '0.5.0')).toBe(false)
    })
})
