import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import AdmZip from 'adm-zip'
import { afterEach, describe, expect, it } from 'vitest'
import { UpdateManager } from '../../src/update/manager'
import {
    APP_API_VERSION,
    DATABASE_SCHEMA_VERSION
} from '../../src/app-capabilities'
import type { UpdateManifest } from '../../src/update/types'

const roots: string[] = []
const sourceSha = '1'.repeat(40)
const targetSha = '2'.repeat(40)

function sha(value: Buffer) {
    return createHash('sha256').update(value).digest('hex')
}

function temporaryRoot() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-update-fallback-'))
    roots.push(root)
    return root
}

function updatePackage() {
    const payload = {
        'web/app.js': Buffer.from('updated'),
        'SOURCE_SHA.txt': Buffer.from(`${targetSha}\n`)
    }
    const manifest: UpdateManifest = {
        manifestVersion: 1,
        packageType: 'incremental',
        sourceVersionRange: '=0.3.2',
        sourceSha,
        targetVersion: '0.3.3',
        targetSourceSha: targetSha,
        appApiVersion: APP_API_VERSION,
        databaseSchemaVersion: DATABASE_SCHEMA_VERSION,
        requiresFullInstall: false,
        files: Object.entries(payload).map(([name, value]) => ({
            path: name,
            sha256: sha(value),
            size: value.byteLength
        })),
        deletions: []
    }
    const zip = new AdmZip()
    zip.addFile('update-manifest.json', Buffer.from(JSON.stringify(manifest)))
    for (const [name, value] of Object.entries(payload))
        zip.addFile(name, value)
    return zip.toBuffer()
}

function response(ok: boolean, text: string, url = '') {
    return {
        ok,
        status: ok ? 200 : 403,
        url,
        text: async () => text,
        json: async () => JSON.parse(text || '{}')
    } as unknown as Response
}

function manager(fetchImplementation: typeof fetch) {
    const root = temporaryRoot()
    return new UpdateManager({
        currentVersion: '0.3.2',
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

afterEach(() => {
    for (const root of roots.splice(0))
        fs.rmSync(root, { recursive: true, force: true })
})

describe('desktop release fallback', () => {
    it('discovers the latest stable update through GitHub release checksums when REST is unavailable', async () => {
        const fetchImplementation = (async (input: string | URL | Request) => {
            const url = String(input)
            if (url.includes('api.github.com')) return response(false, '')
            if (url.endsWith('/releases/latest/download/SHA256SUMS.txt')) {
                return response(
                    true,
                    `${'a'.repeat(64)}  Pica-Library-v0.3.3-update.zip\n`,
                    'https://github.com/Saber-Alter-Lily/pica-library/releases/download/v0.3.3/SHA256SUMS.txt'
                )
            }
            throw new Error(`unexpected URL ${url}`)
        }) as typeof fetch
        await expect(
            manager(fetchImplementation).checkForUpdate()
        ).resolves.toMatchObject({
            status: 'incremental',
            version: '0.3.3',
            assetName: 'Pica-Library-v0.3.3-update.zip'
        })
    })

    it('verifies an official dragged update through SHA256SUMS when GitHub REST is unavailable', async () => {
        const archive = updatePackage()
        const archiveHash = sha(archive)
        const fetchImplementation = (async (input: string | URL | Request) => {
            const url = String(input)
            if (url.includes('api.github.com')) return response(false, '')
            if (url.endsWith('/releases/download/v0.3.3/SHA256SUMS.txt'))
                return response(
                    true,
                    `${archiveHash}  Pica-Library-v0.3.3-update.zip\n`
                )
            throw new Error(`unexpected URL ${url}`)
        }) as typeof fetch
        await expect(
            manager(fetchImplementation).stage(
                'Pica-Library-v0.3.3-update.zip',
                archive
            )
        ).resolves.toMatchObject({ targetVersion: '0.3.3' })
    })

    it('records a failed progress state when validation aborts', async () => {
        const fetchImplementation = (async () =>
            response(false, '')) as typeof fetch
        const value = manager(fetchImplementation)
        await expect(
            value.stage('bad.zip', Buffer.from('not a zip'))
        ).rejects.toThrow()
        expect(value.progress()).toMatchObject({ phase: 'failed' })
    })
})
