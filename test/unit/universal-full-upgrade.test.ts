import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import AdmZip from 'adm-zip'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { UpdateManager } from '../../src/update/manager'

const roots: string[] = []
const targetSourceSha = 'a'.repeat(40)

function temporaryRoot() {
    const root = fs.mkdtempSync(
        path.join(os.tmpdir(), 'pica-universal-upgrade-')
    )
    roots.push(root)
    return root
}

function sha256(value: Buffer) {
    return createHash('sha256').update(value).digest('hex')
}

function fullPackage(extra: Record<string, string | Buffer> = {}) {
    const zip = new AdmZip()
    const files: Record<string, string | Buffer> = {
        'Pica Library.exe': 'launcher',
        'runtime/node.exe': 'node-runtime',
        'app/desktop.js': 'desktop',
        'app/updater.js': 'incremental-updater',
        'app/full-upgrader.js': 'full-upgrader',
        'SOURCE_SHA.txt': targetSourceSha + '\n',
        'web/index.html': '<!doctype html>',
        ...extra
    }
    for (const [name, raw] of Object.entries(files))
        zip.addFile(
            name,
            Buffer.isBuffer(raw) ? raw : Buffer.from(raw)
        )
    return zip.toBuffer()
}

function manager(fetchImplementation: typeof fetch) {
    const root = temporaryRoot()
    const applicationRoot = path.join(root, 'current-app')
    const stateRoot = path.join(root, 'desktop-state', 'updates')
    fs.mkdirSync(applicationRoot, { recursive: true })
    return new UpdateManager({
        currentVersion: '0.4.11',
        currentSourceSha: 'b'.repeat(40),
        applicationRoot,
        stateRoot,
        launcherPath: path.join(applicationRoot, 'Pica Library.exe'),
        runtimePath: path.join(applicationRoot, 'runtime', 'node.exe'),
        desktopEntryPath: path.join(applicationRoot, 'app', 'desktop.js'),
        instanceFile: path.join(
            root,
            'desktop-state',
            'instance.json'
        ),
        target: { platform: 'windows', arch: 'x64' },
        fetchImplementation
    })
}

function latestReleaseFetch() {
    return vi.fn(
        async (input: string | URL | Request) => {
            const url = String(input)
            if (url.includes('/releases/latest'))
                return new Response(
                    JSON.stringify({
                        tag_name: 'v0.5.0',
                        html_url:
                            'https://github.com/Saber-Alter-Lily/pica-library/releases/tag/v0.5.0',
                        draft: false,
                        prerelease: false,
                        assets: [
                            {
                                name: 'Pica-Library-v0.5.0-windows-x64.zip',
                                browser_download_url:
                                    'https://github.com/Saber-Alter-Lily/pica-library/releases/download/v0.5.0/Pica-Library-v0.5.0-windows-x64.zip'
                            }
                        ]
                    }),
                    { status: 200 }
                )
            throw new Error('unexpected fetch: ' + url)
        }
    ) as unknown as typeof fetch
}

function verifiedFullFetch(buffer: Buffer) {
    return vi.fn(
        async (input: string | URL | Request) => {
            const url = String(input)
            if (url.includes('/releases/tags/v0.5.0'))
                return new Response(
                    JSON.stringify({
                        tag_name: 'v0.5.0',
                        draft: false,
                        prerelease: false,
                        assets: [
                            {
                                name: 'Pica-Library-v0.5.0-windows-x64.zip',
                                digest: 'sha256:' + sha256(buffer)
                            }
                        ]
                    }),
                    { status: 200 }
                )
            throw new Error('unexpected fetch: ' + url)
        }
    ) as unknown as typeof fetch
}

afterEach(() => {
    vi.restoreAllMocks()
    for (const root of roots.splice(0))
        fs.rmSync(root, { recursive: true, force: true })
})

describe('universal full application upgrade', () => {
    it('offers a full Windows package as a one-click fallback when no incremental asset exists', async () => {
        const value = await manager(
            latestReleaseFetch()
        ).checkForUpdate()
        expect(value).toMatchObject({
            status: 'full-install',
            version: '0.5.0',
            assetName: 'Pica-Library-v0.5.0-windows-x64.zip',
            assetUrl:
                'https://github.com/Saber-Alter-Lily/pica-library/releases/download/v0.5.0/Pica-Library-v0.5.0-windows-x64.zip',
            oneClick: true
        })
    })

    it('verifies and stages a complete application outside the installed application tree', async () => {
        const archive = fullPackage()
        const updateManager = manager(verifiedFullFetch(archive))
        const value = await updateManager.stageFullApplication(
            '0.5.0',
            'Pica-Library-v0.5.0-windows-x64.zip',
            archive
        )
        expect(value).toMatchObject({
            mode: 'full-application',
            targetVersion: '0.5.0',
            targetSourceSha,
            requiresFullInstall: true,
            oneClick: true
        })
        expect(updateManager.progress()).toMatchObject({
            phase: 'staged',
            targetVersion: '0.5.0'
        })
    })

    it('persists a verified upgrade assistant outside the application tree', () => {
        const root = temporaryRoot()
        const applicationRoot = path.join(root, 'current-app')
        const stateRoot = path.join(root, 'desktop-state', 'runtime-state', 'updates')
        const assistantRoot = path.join(
            root,
            'desktop-state',
            'runtime-state',
            'upgrade-assistant'
        )
        fs.mkdirSync(path.join(applicationRoot, 'runtime'), { recursive: true })
        fs.mkdirSync(path.join(applicationRoot, 'app'), { recursive: true })
        fs.writeFileSync(
            path.join(applicationRoot, 'runtime', 'node.exe'),
            'node-runtime'
        )
        fs.writeFileSync(
            path.join(applicationRoot, 'app', 'full-upgrader.js'),
            'full-upgrader'
        )

        const updateManager = new UpdateManager({
            currentVersion: '0.5.0',
            currentSourceSha: targetSourceSha,
            applicationRoot,
            stateRoot,
            assistantRoot,
            launcherPath: path.join(applicationRoot, 'Pica Library.exe'),
            runtimePath: path.join(applicationRoot, 'runtime', 'node.exe'),
            desktopEntryPath: path.join(applicationRoot, 'app', 'desktop.js'),
            instanceFile: path.join(
                root,
                'desktop-state',
                'runtime-state',
                'instance.json'
            ),
            target: { platform: 'windows', arch: 'x64' },
            fetchImplementation: vi.fn() as unknown as typeof fetch
        })

        const assistant = updateManager.preparePersistentUpgradeAssistant()
        expect(assistant).toMatchObject({
            available: true,
            root: assistantRoot,
            productVersion: '0.5.0',
            sourceSha: targetSourceSha
        })
        if (!assistant.available) throw new Error('assistant unavailable')
        expect(fs.readFileSync(assistant.runtimePath, 'utf8')).toBe(
            'node-runtime'
        )
        expect(fs.readFileSync(assistant.helperPath, 'utf8')).toBe(
            'full-upgrader'
        )
        const metadata = JSON.parse(
            fs.readFileSync(assistant.metadataPath, 'utf8')
        )
        expect(metadata).toMatchObject({
            schemaVersion: 1,
            productVersion: '0.5.0',
            sourceSha: targetSourceSha,
            runtimeSha256: assistant.runtimeSha256,
            helperSha256: assistant.helperSha256
        })
        expect(path.relative(applicationRoot, assistantRoot)).toMatch(/^\.\./)
    })

    it('rejects full application archives that contain user data', async () => {
        const archive = fullPackage({
            'data/library.db': 'must-not-be-packaged'
        })
        await expect(
            manager(verifiedFullFetch(archive)).stageFullApplication(
                '0.5.0',
                'Pica-Library-v0.5.0-windows-x64.zip',
                archive
            )
        ).rejects.toThrow(/User data is forbidden/i)
    })

    it('locks external bootstrap, rollback and automatic browser refresh contracts', () => {
        const managerSource = fs.readFileSync(
            'src/update/manager.ts',
            'utf8'
        )
        const helper = fs.readFileSync(
            'src/update/full-upgrader.ts',
            'utf8'
        )
        const server = fs.readFileSync(
            'src/library/server.ts',
            'utf8'
        )
        const web = fs.readFileSync('web/app.js', 'utf8')
        const rollup = fs.readFileSync('rollup.config.js', 'utf8')
        const artifact = fs.readFileSync(
            'scripts/test-windows-artifact.ps1',
            'utf8'
        )

        expect(rollup).toContain(
            "'full-upgrader': 'src/update/full-upgrader.ts'"
        )
        expect(managerSource).toContain(
            'bootstrap-' + '
        expect(managerSource).toContain(
            "'app',\n                'full-upgrader.js'"
        )
        expect(helper).toContain(
            'snapshotUserState(instruction)'
        )
        expect(helper).toContain(
            'rollbackApplication(instruction)'
        )
        expect(helper).toContain(
            'restoreUserState(instruction, snapshot)'
        )
        expect(server).toContain(
            "status === 'full-install'"
        )
        expect(server).toContain(
            '512 * 1024 * 1024'
        )
        expect(web).toContain(
            'async function reconnectAfterUpdate('
        )
        expect(web).toContain('window.location.reload()')
        expect(artifact).toContain(
            "'app\\full-upgrader.js'"
        )
    })
})
 + '{full.id}'
        )
        expect(managerSource).toContain(
            "'upgrade-assistant'"
        )
        expect(managerSource).toContain(
            'preparePersistentUpgradeAssistant()'
        )
        expect(managerSource).toContain(
            "'app',\n                'full-upgrader.js'"
        )
        expect(helper).toContain(
            'snapshotUserState(instruction)'
        )
        expect(helper).toContain(
            'rollbackApplication(instruction)'
        )
        expect(helper).toContain(
            'restoreUserState(instruction, snapshot)'
        )
        expect(server).toContain(
            "status === 'full-install'"
        )
        expect(server).toContain(
            '512 * 1024 * 1024'
        )
        expect(web).toContain(
            'async function reconnectAfterUpdate('
        )
        expect(web).toContain('window.location.reload()')
        expect(artifact).toContain(
            "'app\\full-upgrader.js'"
        )
    })
})
