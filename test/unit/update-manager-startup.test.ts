import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { EventEmitter } from 'node:events'
import AdmZip from 'adm-zip'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { UpdateManager } from '../../src/update/manager'
import {
    APP_API_VERSION,
    DATABASE_SCHEMA_VERSION
} from '../../src/app-capabilities'
import type { StagedFullApplicationUpdate } from '../../src/update/types'

const { spawn } = vi.hoisted(() => ({ spawn: vi.fn() }))
vi.mock('node:child_process', () => ({ spawn }))
const roots: string[] = []
const previous = 'b'.repeat(40),
    next = 'a'.repeat(40)
const archive = () => {
    const zip = new AdmZip(),
        payload = {
            'SOURCE_SHA.txt': next,
            'web/changed.js': 'synthetic update'
        }
    const manifest = {
        manifestVersion: 1,
        packageType: 'local-test',
        sourceVersionRange: '=0.5.0-dev.base',
        sourceSha: previous,
        targetVersion: '0.5.0-dev.next',
        targetSourceSha: next,
        appApiVersion: APP_API_VERSION,
        databaseSchemaVersion: DATABASE_SCHEMA_VERSION,
        requiresFullInstall: false,
        files: Object.entries(payload).map(([name, bytes]) => ({
            path: name,
            size: Buffer.byteLength(bytes),
            sha256: createHash('sha256').update(bytes).digest('hex')
        })),
        deletions: []
    }
    zip.addFile('update-manifest.json', Buffer.from(JSON.stringify(manifest)))
    for (const [name, bytes] of Object.entries(payload))
        zip.addFile(name, Buffer.from(bytes))
    return zip.toBuffer()
}
async function fixture(mode: 'incremental' | 'full-application') {
    const root = fs.mkdtempSync(
        path.join(os.tmpdir(), 'pica-update-manager-startup-')
    )
    roots.push(root)
    const app = path.join(root, 'app'),
        state = path.join(root, 'home/runtime-state/updates')
    for (const name of [
        'runtime/node.exe',
        'app/updater.js',
        'app/full-upgrader.js',
        'app/desktop.js',
        'Pica Library.exe',
        'SOURCE_SHA.txt'
    ]) {
        const file = path.join(app, name)
        fs.mkdirSync(path.dirname(file), { recursive: true })
        fs.writeFileSync(
            file,
            name === 'SOURCE_SHA.txt' ? previous : 'synthetic'
        )
    }
    const manager = new UpdateManager({
        currentVersion: '0.5.0-dev.base',
        currentSourceSha: previous,
        applicationRoot: app,
        stateRoot: state,
        launcherPath: path.join(app, 'Pica Library.exe'),
        runtimePath: path.join(app, 'runtime/node.exe'),
        desktopEntryPath: path.join(app, 'app/desktop.js'),
        instanceFile: path.join(root, 'home/instance.json'),
        target: { platform: 'windows', arch: 'x64' }
    })
    let id: string
    if (mode === 'incremental')
        id = (await manager.stage('local.zip', archive())).id
    else {
        id = 'fixture-full'
        ;(
            manager as unknown as { stagedFull: StagedFullApplicationUpdate }
        ).stagedFull = {
            id,
            directory: path.join(root, 'full-staged'),
            archiveName: 'synthetic.zip',
            archiveSha256: 'fixture',
            targetVersion: '0.6.0',
            targetSourceSha: next,
            runtimeComposition: { formatVersion: 1, sourceRuntimes: [] },
            stagedAt: new Date(0).toISOString()
        }
        fs.mkdirSync(path.join(root, 'full-staged'))
        const digest = createHash('sha256').update('synthetic').digest('hex')
        vi.spyOn(manager, 'preparePersistentUpgradeAssistant').mockReturnValue({
            available: true,
            runtimePath: path.join(app, 'runtime/node.exe'),
            helperPath: path.join(app, 'app/full-upgrader.js'),
            runtimeSha256: digest,
            helperSha256: digest
        } as ReturnType<UpdateManager['preparePersistentUpgradeAssistant']>)
    }
    const context = {
        desktopHomeRoot: path.join(root, 'home'),
        libraryDirectory: path.join(root, 'library')
    }
    return { root, app, state, manager, id, mode, context }
}
function child() {
    const value = Object.assign(new EventEmitter(), {
        pid: 9876542,
        exitCode: null as number | null,
        signalCode: null,
        unref: vi.fn(),
        kill: vi.fn(() => {
            queueMicrotask(() => {
                value.exitCode = 1
                value.emit('exit', 1, null)
            })
            return true
        })
    })
    return value
}
function publish(
    f: Awaited<ReturnType<typeof fixture>>,
    value: ReturnType<typeof child>,
    args: readonly string[]
) {
    const input = JSON.parse(fs.readFileSync(args[1], 'utf8'))
    fs.writeFileSync(
        input.readyFile,
        JSON.stringify({
            schemaVersion: 1,
            kind: f.mode,
            nonce: input.readyNonce,
            parentPid: input.parentPid,
            pid: value.pid
        })
    )
    return input
}
beforeEach(() => spawn.mockReset())
afterEach(() => {
    vi.restoreAllMocks()
    for (const root of roots.splice(0))
        fs.rmSync(root, { recursive: true, force: true })
})

describe.each(['incremental', 'full-application'] as const)(
    'UpdateManager %s startup authority',
    (mode) => {
        it('retains the apply lock when an unconfirmed helper cannot be stopped safely', async () => {
            const f = await fixture(mode),
                value = child()
            value.kill.mockImplementation(() => false)
            spawn.mockImplementation((_executable, args) => {
                queueMicrotask(() => {
                    value.emit('spawn')
                    const input = publish(f, value, args)
                    const record = JSON.parse(
                        fs.readFileSync(input.readyFile, 'utf8')
                    )
                    record.pid = 1
                    fs.writeFileSync(input.readyFile, JSON.stringify(record))
                })
                return value
            })
            const failed = f.manager.apply(f.id, f.context)
            await expect(failed).rejects.toThrow('could not be stopped')
            expect(f.manager.apply(f.id, f.context)).toBe(failed)
            expect(() => f.manager.apply('another-stage', f.context)).toThrow(
                'already being applied'
            )
            await expect(
                f.manager.stage('another.zip', archive())
            ).rejects.toThrow('already being applied')
            expect(spawn).toHaveBeenCalledTimes(1)
            expect(
                fs.readFileSync(path.join(f.app, 'SOURCE_SHA.txt'), 'utf8')
            ).toBe(previous)
        })
        it('rejects asynchronous helper spawn errors and permits a safe fresh readiness retry', async () => {
            const f = await fixture(mode),
                first = child(),
                second = child()
            spawn.mockImplementationOnce(() => {
                queueMicrotask(() =>
                    first.emit('error', new Error('synthetic helper EACCES'))
                )
                return first
            })
            await expect(f.manager.apply(f.id, f.context)).rejects.toThrow(
                'synthetic helper EACCES'
            )
            expect(f.manager.progress()).toMatchObject({
                phase: 'failed',
                message: 'synthetic helper EACCES'
            })
            expect(
                fs.readFileSync(path.join(f.app, 'SOURCE_SHA.txt'), 'utf8')
            ).toBe(previous)
            spawn.mockImplementationOnce((_executable, args) => {
                queueMicrotask(() => {
                    second.emit('spawn')
                    publish(f, second, args)
                })
                return second
            })
            await expect(
                f.manager.apply(f.id, f.context)
            ).resolves.toMatchObject({ accepted: true, mode })
            expect(spawn).toHaveBeenCalledTimes(2)
        })
        it('deduplicates repeated apply, rejects concurrent staging and waits for real readiness rather than only spawn', async () => {
            const f = await fixture(mode),
                value = child()
            let accept!: () => void
            spawn.mockImplementation((_executable, args) => {
                queueMicrotask(() => value.emit('spawn'))
                accept = () => publish(f, value, args)
                return value
            })
            const pending = f.manager.apply(f.id, f.context)
            expect(f.manager.apply(f.id, f.context)).toBe(pending)
            expect(() => f.manager.apply('different-stage', f.context)).toThrow(
                'already being applied'
            )
            await expect(
                f.manager.stage('another.zip', archive())
            ).rejects.toThrow('already being applied')
            await expect(
                f.manager.stageFullApplication(
                    '0.6.0',
                    'synthetic.zip',
                    Buffer.from('')
                )
            ).rejects.toThrow('already being applied')
            let accepted = false
            void pending.then(() => {
                accepted = true
            })
            await new Promise((resolve) => setTimeout(resolve, 10))
            expect(accepted).toBe(false)
            accept()
            await expect(pending).resolves.toMatchObject({
                accepted: true,
                mode
            })
            expect(f.manager.apply(f.id, f.context)).toBe(pending)
            expect(spawn).toHaveBeenCalledTimes(1)
        })
        it('keeps the current application intact when the helper exits before readiness', async () => {
            const f = await fixture(mode),
                value = child()
            spawn.mockImplementation(() => {
                queueMicrotask(() => {
                    value.emit('spawn')
                    value.exitCode = 2
                    value.emit('exit', 2, null)
                })
                return value
            })
            await expect(f.manager.apply(f.id, f.context)).rejects.toThrow(
                'exited before startup confirmation'
            )
            expect(f.manager.progress().phase).toBe('failed')
            expect(
                fs.readFileSync(path.join(f.app, 'SOURCE_SHA.txt'), 'utf8')
            ).toBe(previous)
            expect(value.kill).not.toHaveBeenCalled()
        })
    }
)
