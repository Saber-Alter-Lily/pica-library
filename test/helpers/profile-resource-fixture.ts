import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import AdmZip from 'adm-zip'
import { computePackContentRoot } from '../../src/ecosystem/pack-manifest'
export const digest = (bytes: Uint8Array) =>
    createHash('sha256').update(bytes).digest('hex')
export function themeArchive(
    id = 'own-theme',
    extra?: {
        badPalette?: boolean
        badComponent?: boolean
        executable?: boolean
    }
) {
    const zip = new AdmZip()
    zip.addFile(
        'manifest.json',
        Buffer.from(
            JSON.stringify({
                themeFormatVersion: 1,
                id,
                name: 'Synthetic own theme',
                author: 'Synthetic QA',
                version: '1.0.0',
                description: 'Data-only synthetic fixture'
            })
        )
    )
    zip.addFile(
        'palette.json',
        Buffer.from(
            JSON.stringify({
                light: {
                    primary: extra?.badPalette
                        ? 'url(https://example.invalid/)'
                        : '#445566'
                }
            })
        )
    )
    zip.addFile(
        'layout.json',
        Buffer.from(JSON.stringify({ cardRadiusDp: 20 }))
    )
    zip.addFile(
        'components.json',
        Buffer.from(
            JSON.stringify({
                progress: {
                    style: extra?.badComponent ? 'javascript' : 'classic'
                }
            })
        )
    )
    zip.addFile(
        extra?.executable ? 'assets/executable.js' : 'assets/pixel.png',
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    )
    return zip.toBuffer()
}
const fixtures: Array<{ root: string; stages: Array<{ discard(): void }> }> = []
export function resourceFixture(present = true) {
    const root = fs.realpathSync(
            fs.mkdtempSync(path.join(os.tmpdir(), 'pica-resource-stage-test-'))
        ),
        home = path.join(root, 'home'),
        parent = path.join(root, 'stages'),
        personal = path.join(home, 'runtime-state', 'personalization'),
        themes = path.join(personal, 'packs'),
        theme = path.join(themes, 'own-theme.pica-theme'),
        active = path.join(personal, 'active-theme-v1.json'),
        packId = 'org.example.tags',
        generation = '2026.10.24.1',
        packRoot = path.join(home, 'packs', packId, generation),
        manifestFile = path.join(packRoot, 'pack.json'),
        payload = path.join(packRoot, 'payload', 'data.json'),
        empty = path.join(packRoot, 'payload', 'empty.bin')
    fs.mkdirSync(home)
    fs.mkdirSync(parent)
    const bytes = Buffer.from(
            '{"tag":"synthetic","provider":"opaque-user-source"}'
        ),
        files = [
            {
                path: 'payload/data.json',
                sha256: digest(bytes),
                size: bytes.length
            },
            {
                path: 'payload/empty.bin',
                sha256: digest(Buffer.alloc(0)),
                size: 0
            }
        ]
    const manifest = {
        schemaVersion: 1,
        packId,
        packType: 'TAG_ALIAS',
        generation,
        createdAt: '2026-10-24T00:00:00Z',
        minimumAppVersion: '0.6.0',
        contentLicense: 'CC0-1.0',
        publisher: { id: 'org.example' },
        dependencies: [],
        files,
        contentRootSha256: computePackContentRoot(files)
    }
    if (present) {
        fs.mkdirSync(themes, { recursive: true })
        fs.writeFileSync(theme, themeArchive())
        fs.writeFileSync(active, JSON.stringify({ id: 'own-theme' }))
        fs.mkdirSync(path.dirname(payload), { recursive: true })
        fs.writeFileSync(payload, bytes)
        fs.writeFileSync(empty, Buffer.alloc(0))
        fs.writeFileSync(manifestFile, JSON.stringify(manifest))
    }
    const stages: Array<{ discard(): void }> = []
    fixtures.push({ root, stages })
    return {
        root,
        home,
        parent,
        personal,
        themes,
        theme,
        active,
        packId,
        generation,
        packRoot,
        manifestFile,
        payload,
        empty,
        manifest,
        stages,
        input: {
            desktopHomeRoot: home,
            stagingParent: parent,
            appVersion: '0.5.0'
        }
    }
}
export function cleanupResourceFixtures() {
    for (const { root, stages } of fixtures.splice(0)) {
        for (const stage of stages) {
            try {
                stage.discard()
            } catch {
                /* foreign paths are intentionally retained by the adapter */
            }
        }
        if (
            fs.realpathSync(root) !== root ||
            path.dirname(root) !== fs.realpathSync(os.tmpdir()) ||
            !path.basename(root).startsWith('pica-resource-stage-test-') ||
            fs.lstatSync(root).isSymbolicLink()
        )
            throw Error('Unsafe synthetic resource cleanup')
        fs.rmSync(root, { recursive: true, force: false })
    }
}
