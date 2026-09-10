import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import AdmZip from 'adm-zip'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { UpdateManager } from '../../src/update/manager'
import { normalizeUpdatePath } from '../../src/update/path-safety'
import {
    APP_API_VERSION,
    DATABASE_SCHEMA_VERSION
} from '../../src/app-capabilities'
import type { UpdateManifest } from '../../src/update/types'

const tempDirs: string[] = []
const sourceSha = '1'.repeat(40)
const targetSourceSha = '2'.repeat(40)

function temp() {
    const value = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-update-'))
    tempDirs.push(value)
    return value
}

function hash(value: Buffer) {
    return createHash('sha256').update(value).digest('hex')
}

function packageBuffer(
    overrides: Partial<UpdateManifest> = {},
    payload: Record<string, Buffer | string> = {
        'web/app.js': 'updated',
        'SOURCE_SHA.txt': `${targetSourceSha}\n`
    }
) {
    const files = Object.entries(payload).map(([name, raw]) => {
        const value = Buffer.isBuffer(raw) ? raw : Buffer.from(raw)
        return { path: name, sha256: hash(value), size: value.byteLength }
    })
    const manifest: UpdateManifest = {
        manifestVersion: 1,
        packageType: 'local-test',
        sourceVersionRange: '=0.2.0-dev.0',
        sourceSha,
        targetVersion: '0.2.0-dev.1',
        targetSourceSha,
        appApiVersion: APP_API_VERSION,
        databaseSchemaVersion: DATABASE_SCHEMA_VERSION,
        requiresFullInstall: false,
        files,
        deletions: [],
        ...overrides
    }
    const zip = new AdmZip()
    zip.addFile(
        'update-manifest.json',
        Buffer.from(JSON.stringify(manifest), 'utf8')
    )
    for (const [name, raw] of Object.entries(payload))
        zip.addFile(name, Buffer.isBuffer(raw) ? raw : Buffer.from(raw))
    return { buffer: zip.toBuffer(), manifest }
}

function manager(version = '0.2.0-dev.0', fetchImplementation?: typeof fetch) {
    const root = temp()
    return new UpdateManager({
        currentVersion: version,
        currentSourceSha: sourceSha,
        applicationRoot: root,
        stateRoot: path.join(root, 'state'),
        launcherPath: path.join(root, 'Pica Library.exe'),
        runtimePath: process.execPath,
        desktopEntryPath: path.join(root, 'app', 'desktop.js'),
        instanceFile: path.join(root, 'instance.json'),
        fetchImplementation
    })
}

function stableUpdate(targetVersion = '0.2.1') {
    return packageBuffer({
        packageType: 'incremental',
        sourceVersionRange: '=0.2.0',
        targetVersion
    })
}

function officialRelease(
    update: ReturnType<typeof packageBuffer>,
    overrides: Record<string, unknown> = {}
) {
    return vi.fn(
        async () =>
            new Response(
                JSON.stringify({
                    tag_name: `v${update.manifest.targetVersion}`,
                    draft: false,
                    prerelease: false,
                    assets: [
                        {
                            name: `Pica-Library-v${update.manifest.targetVersion}-update.zip`,
                            digest: `sha256:${hash(update.buffer)}`
                        }
                    ],
                    ...overrides
                }),
                { status: 200 }
            )
    ) as unknown as typeof fetch
}

afterEach(() => {
    vi.restoreAllMocks()
    for (const directory of tempDirs.splice(0))
        fs.rmSync(directory, { recursive: true, force: true })
})

describe('UpdateManager', () => {
    it('rejects absolute, traversal and ADS paths', () => {
        for (const value of [
            'C:\\Windows\\system32\\bad.dll',
            '../outside',
            'web/../outside',
            'web/app.js:stream',
            '/absolute'
        ])
            expect(() => normalizeUpdatePath(value)).toThrow()
        expect(normalizeUpdatePath('web/app.js')).toBe('web/app.js')
        expect(() =>
            normalizeUpdatePath(
                'src/data/registry-v3-final/PICA_REGISTRY_V3_FINAL_MANIFEST.json'
            )
        ).toThrow()
        expect(
            normalizeUpdatePath(
                'app/runtime-assets/registry-v3-final/PICA_REGISTRY_V3_FINAL_MANIFEST.json'
            )
        ).toBe(
            'app/runtime-assets/registry-v3-final/PICA_REGISTRY_V3_FINAL_MANIFEST.json'
        )
        expect(() => normalizeUpdatePath('src/data/other.json')).toThrow()
    })

    it('accepts and stages a verified local-test update for a dev build', async () => {
        const update = packageBuffer()
        const value = await manager().stage(
            'Pica-Library-v0.2.0-dev.1-local-update.zip',
            update.buffer
        )
        expect(value).toMatchObject({
            targetVersion: '0.2.0-dev.1',
            fileCount: 2,
            requiresFullInstall: false,
            packageType: 'local-test'
        })
        expect(manager().progress().phase).toBe('idle')
    })

    it('rejects local-test packages in stable builds', async () => {
        const update = packageBuffer({ sourceVersionRange: '=0.2.0' })
        await expect(
            manager('0.2.0').stage('update.zip', update.buffer)
        ).rejects.toThrow(/Stable builds reject local-test/)
    })

    it('rejects wrong source versions and source SHAs', async () => {
        await expect(
            manager().stage(
                'update.zip',
                packageBuffer({ sourceVersionRange: '=0.1.0' }).buffer
            )
        ).rejects.toThrow(/installed version/)
        await expect(
            manager().stage(
                'update.zip',
                packageBuffer({ sourceSha: '3'.repeat(40) }).buffer
            )
        ).rejects.toThrow(/installed source build/)
    })

    it('rejects hash mismatches, undeclared files and user data', async () => {
        const badHash = packageBuffer()
        badHash.manifest.files[0].sha256 = '0'.repeat(64)
        const badHashZip = new AdmZip()
        badHashZip.addFile(
            'update-manifest.json',
            Buffer.from(JSON.stringify(badHash.manifest))
        )
        badHashZip.addFile('web/app.js', Buffer.from('updated'))
        badHashZip.addFile(
            'SOURCE_SHA.txt',
            Buffer.from(`${targetSourceSha}\n`)
        )
        await expect(
            manager().stage('update.zip', badHashZip.toBuffer())
        ).rejects.toThrow(/hash or size mismatch/)

        const userData = packageBuffer(
            {},
            {
                'app/library.db': 'secret',
                'SOURCE_SHA.txt': `${targetSourceSha}\n`
            }
        )
        await expect(
            manager().stage('update.zip', userData.buffer)
        ).rejects.toThrow(/User data/)
    })

    it('requires full install when the updater helper changes', async () => {
        const update = packageBuffer(
            {},
            {
                'app/updater.js': 'new updater',
                'SOURCE_SHA.txt': `${targetSourceSha}\n`
            }
        )
        await expect(
            manager().stage('update.zip', update.buffer)
        ).rejects.toThrow(/Updater replacement requires a full install/)
        const fallback = packageBuffer(
            { requiresFullInstall: true },
            {
                'app/updater.js': 'new updater',
                'SOURCE_SHA.txt': `${targetSourceSha}\n`
            }
        )
        await expect(
            manager().stage('update.zip', fallback.buffer)
        ).resolves.toMatchObject({ requiresFullInstall: true })
    })

    it('rejects forbidden deletions and updater self-deletion', async () => {
        await expect(
            manager().stage(
                'update.zip',
                packageBuffer({ deletions: ['app/data/library.db'] }).buffer
            )
        ).rejects.toThrow(/User data/)
        await expect(
            manager().stage(
                'update.zip',
                packageBuffer({ deletions: ['app/updater.js'] }).buffer
            )
        ).rejects.toThrow(/Updater replacement requires a full install/)
    })

    it('requires a full install for incompatible API or database schemas', async () => {
        for (const overrides of [
            { appApiVersion: APP_API_VERSION + 1 },
            { databaseSchemaVersion: DATABASE_SCHEMA_VERSION - 1 },
            { databaseSchemaVersion: DATABASE_SCHEMA_VERSION + 2 }
        ])
            await expect(
                manager().stage('update.zip', packageBuffer(overrides).buffer)
            ).rejects.toThrow(/compatibility requires a full install/)

        await expect(
            manager().stage(
                'update.zip',
                packageBuffer({
                    databaseSchemaVersion: DATABASE_SCHEMA_VERSION + 2,
                    requiresFullInstall: true
                }).buffer
            )
        ).resolves.toMatchObject({ requiresFullInstall: true })
    })

    it('verifies stable incremental packages against official release metadata', async () => {
        const update = packageBuffer({
            packageType: 'incremental',
            sourceVersionRange: '=0.2.0',
            targetVersion: '0.2.1'
        })
        const archiveHash = hash(update.buffer)
        const fetchImplementation = vi.fn(
            async () =>
                new Response(
                    JSON.stringify({
                        tag_name: 'v0.2.1',
                        assets: [
                            {
                                name: 'Pica-Library-v0.2.1-update.zip',
                                digest: `sha256:${archiveHash}`
                            }
                        ]
                    }),
                    { status: 200 }
                )
        ) as unknown as typeof fetch
        await expect(
            manager('0.2.0', fetchImplementation).stage(
                'Pica-Library-v0.2.1-update.zip',
                update.buffer
            )
        ).resolves.toMatchObject({ targetVersion: '0.2.1' })
        expect(fetchImplementation).toHaveBeenCalledOnce()
    })

    it('rejects a prerelease target when staging from a stable build', async () => {
        const update = stableUpdate('0.2.1-rc.1')
        const fetchImplementation = officialRelease(update)
        await expect(
            manager('0.2.0', fetchImplementation).stage(
                'Pica-Library-v0.2.1-rc.1-update.zip',
                update.buffer
            )
        ).rejects.toThrow(/strictly newer stable target/)
        expect(fetchImplementation).not.toHaveBeenCalled()
    })

    it('rejects an official release marked as prerelease', async () => {
        const update = stableUpdate()
        await expect(
            manager(
                '0.2.0',
                officialRelease(update, { prerelease: true })
            ).stage('Pica-Library-v0.2.1-update.zip', update.buffer)
        ).rejects.toThrow(/无法验证更新包来自官方/)
    })

    it('rejects an official release marked as draft', async () => {
        const update = stableUpdate()
        await expect(
            manager('0.2.0', officialRelease(update, { draft: true })).stage(
                'Pica-Library-v0.2.1-update.zip',
                update.buffer
            )
        ).rejects.toThrow(/无法验证更新包来自官方/)
    })

    it('rejects a same-version stable update', async () => {
        const update = stableUpdate('0.2.0')
        const fetchImplementation = officialRelease(update)
        await expect(
            manager('0.2.0', fetchImplementation).stage(
                'Pica-Library-v0.2.0-update.zip',
                update.buffer
            )
        ).rejects.toThrow(/strictly newer stable target/)
        expect(fetchImplementation).not.toHaveBeenCalled()
    })

    it('rejects a stable downgrade', async () => {
        const update = stableUpdate('0.1.9')
        const fetchImplementation = officialRelease(update)
        await expect(
            manager('0.2.0', fetchImplementation).stage(
                'Pica-Library-v0.1.9-update.zip',
                update.buffer
            )
        ).rejects.toThrow(/strictly newer stable target/)
        expect(fetchImplementation).not.toHaveBeenCalled()
    })

    it('accepts a strictly newer stable official update', async () => {
        const update = stableUpdate('0.3.0')
        await expect(
            manager('0.2.0', officialRelease(update)).stage(
                'Pica-Library-v0.3.0-update.zip',
                update.buffer
            )
        ).resolves.toMatchObject({ targetVersion: '0.3.0' })
    })

    it('fails closed when official stable verification is unavailable', async () => {
        const update = packageBuffer({
            packageType: 'incremental',
            sourceVersionRange: '=0.2.0',
            targetVersion: '0.2.1'
        })
        const fetchImplementation = vi.fn(
            async () => new Response('{}', { status: 404 })
        ) as unknown as typeof fetch
        await expect(
            manager('0.2.0', fetchImplementation).stage(
                'Pica-Library-v0.2.1-update.zip',
                update.buffer
            )
        ).rejects.toThrow(/无法验证更新包来自官方/)
    })

    it('reports the current version when no newer stable release exists', async () => {
        const fetchImplementation = vi.fn(
            async () =>
                new Response(
                    JSON.stringify({
                        tag_name: 'v0.2.0',
                        html_url:
                            'https://github.com/Saber-Alter-Lily/pica-library/releases/tag/v0.2.0',
                        draft: false,
                        prerelease: false,
                        assets: []
                    }),
                    { status: 200 }
                )
        ) as unknown as typeof fetch
        await expect(
            manager('0.2.0', fetchImplementation).checkForUpdate()
        ).resolves.toEqual({ status: 'current', currentVersion: '0.2.0' })
    })

    it('requires a full install when a newer stable release has no update ZIP', async () => {
        const releaseUrl =
            'https://github.com/Saber-Alter-Lily/pica-library/releases/tag/v0.3.0'
        const fetchImplementation = vi.fn(
            async () =>
                new Response(
                    JSON.stringify({
                        tag_name: 'v0.3.0',
                        html_url: releaseUrl,
                        draft: false,
                        prerelease: false,
                        assets: [
                            { name: 'Pica-Library-v0.3.0-windows-x64.zip' }
                        ]
                    }),
                    { status: 200 }
                )
        ) as unknown as typeof fetch
        await expect(
            manager('0.2.0', fetchImplementation).checkForUpdate()
        ).resolves.toEqual({
            status: 'full-install',
            version: '0.3.0',
            releaseUrl
        })
    })

    it('offers only a stable official incremental update asset', async () => {
        const releaseUrl =
            'https://github.com/Saber-Alter-Lily/pica-library/releases/tag/v0.2.1'
        const assetUrl = `${releaseUrl}/download/Pica-Library-v0.2.1-update.zip`
        const fetchImplementation = vi.fn(
            async () =>
                new Response(
                    JSON.stringify({
                        tag_name: 'v0.2.1',
                        html_url: releaseUrl,
                        draft: false,
                        prerelease: false,
                        assets: [
                            {
                                name: 'Pica-Library-v0.2.1-update.zip',
                                browser_download_url: assetUrl
                            }
                        ]
                    }),
                    { status: 200 }
                )
        ) as unknown as typeof fetch
        await expect(
            manager('0.2.0', fetchImplementation).checkForUpdate()
        ).resolves.toEqual({
            status: 'incremental',
            version: '0.2.1',
            releaseUrl,
            assetName: 'Pica-Library-v0.2.1-update.zip',
            assetUrl
        })
    })
})
