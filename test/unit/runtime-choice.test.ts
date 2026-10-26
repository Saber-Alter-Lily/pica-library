import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { randomUUID, createHash } from 'node:crypto'
import AdmZip from 'adm-zip'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { UpdateManager } from '../../src/update/manager'
import { UpdateDownloadTask } from '../../src/update/download-task'
import { discoverRuntimeChoiceRelease } from '../../src/update/runtime-choice-release'
import {
    RUNTIME_CHOICE_TTL_MS,
    validateRuntimeChoiceReceipt,
    validateRuntimeChoiceVersion,
    type RuntimeChoiceReceipt
} from '../../src/update/runtime-choice'
import {
    RUNTIME_CHOICE_ROUTES,
    runtimeChoiceAuthority,
    runtimeChoiceCommand
} from '../../src/update/runtime-choice-http'
import {
    type RuntimeComposition,
    RUNTIME_COMPOSITION_PATH
} from '../../src/modules/runtime-composition'
import { type StagedFullApplicationUpdate } from '../../src/update/types'
import { runFullApplicationUpgrade } from '../../src/update/full-upgrader'
import * as helperStartup from '../../src/update/helper-startup'
import { createUpdateAbortScope } from '../../src/update/abort-scope'

const core: RuntimeComposition = { formatVersion: 1, sourceRuntimes: [] },
    jm: RuntimeComposition = { formatVersion: 1, sourceRuntimes: ['jm'] }
const sha = '1'.repeat(40),
    nextSha = '2'.repeat(40),
    roots: string[] = []
const digest = (bytes: Buffer) =>
    createHash('sha256').update(bytes).digest('hex')
const component = {
    'runtime/jm/bin/java.exe': 'synthetic, never executable',
    'runtime/jm/lib/pica-jm-source.jar': 'synthetic, never executable',
    'runtime/jm/PICA_JM_RUNTIME.json': '{}'
}
function write(root: string, name: string, value: string | Buffer) {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true })
    fs.writeFileSync(path.join(root, name), value)
}
function full(composition = jm, source = nextSha) {
    const zip = new AdmZip()
    for (const [name, value] of Object.entries({
        'Pica Library.exe': 'synthetic',
        'runtime/node.exe': 'synthetic',
        'app/desktop.js': 'synthetic',
        'app/updater.js': 'synthetic',
        'app/full-upgrader.js': 'synthetic',
        'SOURCE_SHA.txt': source,
        [RUNTIME_COMPOSITION_PATH]: JSON.stringify(composition),
        ...(composition.sourceRuntimes.length ? component : {})
    })) {
        zip.addFile(name, Buffer.from(value))
        zip.getEntry(name)!.header.time = new Date('2026-10-25T00:00:00Z')
    }
    return zip.toBuffer()
}
function release(
    composition: RuntimeComposition,
    bytes: Buffer,
    version = '0.5.1'
) {
    const name = `Pica-Library-v${version}${composition.sourceRuntimes.length ? '-with-jm' : ''}-windows-x64.zip`,
        url = `https://github.com/Saber-Alter-Lily/pica-library/releases/download/v${version}/${name}`
    return {
        tag_name: 'v' + version,
        draft: false,
        prerelease: false,
        assets: [
            {
                name,
                browser_download_url: url,
                digest: 'sha256:' + digest(bytes),
                size: bytes.length
            }
        ]
    }
}
function fixture(composition = core, version = '0.5.0') {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-runtime-choice-'))
    roots.push(root)
    const app = path.join(root, 'application')
    fs.mkdirSync(app)
    write(app, 'SOURCE_SHA.txt', sha)
    write(app, RUNTIME_COMPOSITION_PATH, JSON.stringify(composition))
    if (composition.sourceRuntimes.length)
        for (const [name, value] of Object.entries(component))
            write(app, name, value)
    write(
        root,
        'profile/config.json',
        JSON.stringify({
            sourceChoices: ['synthetic-original-choice'],
            privateTags: ['synthetic-tag']
        })
    )
    const request = vi.fn(
        async (_input: RequestInfo | URL, _init?: RequestInit) =>
            new Response(JSON.stringify(release(jm, full(jm))), { status: 200 })
    )
    const manager = new UpdateManager({
        currentVersion: version,
        currentSourceSha: sha,
        applicationRoot: app,
        stateRoot: path.join(root, 'state'),
        runtimePath: process.execPath,
        launcherPath: path.join(app, 'Pica Library.exe'),
        desktopEntryPath: path.join(app, 'app/desktop.js'),
        instanceFile: path.join(root, 'profile/instance.json'),
        target: { platform: 'windows', arch: 'x64' },
        fetchImplementation: request
    })
    return {
        root,
        app,
        request,
        manager,
        staged: () =>
            (
                manager as unknown as {
                    stagedFull: StagedFullApplicationUpdate | null
                }
            ).stagedFull
    }
}
function deferred<T>() {
    let resolve!: (value: T) => void, reject!: (error: Error) => void
    const promise = new Promise<T>((yes, no) => {
        resolve = yes
        reject = no
    })
    return { promise, resolve, reject }
}
afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
    for (const root of roots.splice(0))
        fs.rmSync(root, { recursive: true, force: true })
})

describe('explicit runtime choice, not an automatic component or source change', () => {
    it('does no network/download when already in the selected composition', async () => {
        const f = fixture()
        expect(await f.manager.planRuntimeChoice('core')).toMatchObject({
            status: 'unchanged',
            composition: core
        })
        expect(f.request).not.toHaveBeenCalled()
    })
    it.each([
        [core, jm, 'jm'],
        [jm, core, 'core']
    ] as const)(
        'uses actual manager preview -> bound full stage without changing source/account state %j -> %j',
        async (current, target, choice) => {
            const f = fixture(current),
                bytes = full(target)
            f.request.mockImplementation(
                async () => new Response(JSON.stringify(release(target, bytes)))
            )
            const before = fs.readFileSync(
                path.join(f.root, 'profile/config.json')
            )
            const plan = await f.manager.planRuntimeChoice(choice)
            if (plan.status !== 'preview') throw Error('Expected preview')
            expect(plan).toMatchObject({
                from: current,
                to: target,
                sourceEnablement: 'unchanged',
                accountsAndData: 'retained',
                archiveSha256: digest(bytes)
            })
            const download = vi.fn(async () => bytes),
                staged = await f.manager.prepareRuntimeChoice(plan.id, download)
            expect(staged).toMatchObject({
                mode: 'full-application',
                archiveSha256: digest(bytes),
                targetSourceSha: nextSha
            })
            expect(download).toHaveBeenCalledTimes(1)
            expect(f.request).toHaveBeenCalledTimes(2)
            expect(f.staged()?.runtimeChoice).toMatchObject({
                kind: 'user-selected-runtime-composition',
                from: current,
                to: target,
                sourceSha: sha,
                targetSourceSha: nextSha
            })
            expect(
                fs.readFileSync(path.join(f.app, 'SOURCE_SHA.txt'), 'utf8')
            ).toBe(sha)
            expect(
                fs.readFileSync(path.join(f.root, 'profile/config.json'))
            ).toEqual(before)
            await expect(
                f.manager.prepareRuntimeChoice(plan.id, download)
            ).rejects.toThrow(/expired/)
            expect(download).toHaveBeenCalledTimes(1)
        }
    )
    it('permits an explicitly selected same-version composition only for the same source commit', async () => {
        const f = fixture(),
            bytes = full(jm, sha)
        f.request.mockImplementation(
            async () =>
                new Response(JSON.stringify(release(jm, bytes, '0.5.0')))
        )
        const plan = await f.manager.planRuntimeChoice('jm')
        if (plan.status !== 'preview') throw Error('Expected preview')
        expect(
            await f.manager.prepareRuntimeChoice(plan.id, async () => bytes)
        ).toMatchObject({ targetVersion: '0.5.0' })
        await expect(
            f.manager.stageFullApplication('0.5.0', plan.archiveName, bytes)
        ).rejects.toThrow(/newer stable/)
        const g = fixture(),
            changed = full(jm, nextSha)
        g.request.mockImplementation(
            async () =>
                new Response(JSON.stringify(release(jm, changed, '0.5.0')))
        )
        const other = await g.manager.planRuntimeChoice('jm')
        if (other.status !== 'preview') throw Error('Expected preview')
        await expect(
            g.manager.prepareRuntimeChoice(other.id, async () => changed)
        ).rejects.toThrow(/no longer matches/)
    })
    it('rejects stale source, altered bytes, superseded/expired preview and unpublished-version clients', async () => {
        const f = fixture(),
            plan = await f.manager.planRuntimeChoice('jm')
        if (plan.status !== 'preview') throw Error('Expected preview')
        const download = vi.fn(async () => full())
        write(f.app, 'SOURCE_SHA.txt', nextSha)
        await expect(
            f.manager.prepareRuntimeChoice(plan.id, download)
        ).rejects.toThrow(/source changed/)
        expect(download).not.toHaveBeenCalled()
        const g = fixture(),
            first = await g.manager.planRuntimeChoice('jm'),
            second = await g.manager.planRuntimeChoice('jm')
        if (first.status !== 'preview' || second.status !== 'preview')
            throw Error('Expected previews')
        await expect(
            g.manager.prepareRuntimeChoice(first.id, download)
        ).rejects.toThrow(/expired/)
        await expect(
            g.manager.prepareRuntimeChoice(second.id, async () =>
                Buffer.from('wrong bytes')
            )
        ).rejects.toThrow(/changed after preview/)
        const h = fixture(),
            expiring = await h.manager.planRuntimeChoice('jm')
        if (expiring.status !== 'preview') throw Error('Expected preview')
        vi.spyOn(Date, 'now').mockReturnValue(expiring.validUntil + 1)
        await expect(
            h.manager.prepareRuntimeChoice(expiring.id, download)
        ).rejects.toThrow(/expired/)
        await expect(
            fixture(core, '0.5.0-postrc.test').manager.planRuntimeChoice('jm')
        ).rejects.toThrow(/stable application/)
    })
    it.each(['source', 'descriptor'] as const)(
        'rechecks the receipt before helper preparation when staged %s changes',
        async (mutation) => {
            const f = fixture(),
                plan = await f.manager.planRuntimeChoice('jm')
            if (plan.status !== 'preview') throw Error('Expected preview')
            await f.manager.prepareRuntimeChoice(plan.id, async () => full())
            const staged = f.staged()!
            if (mutation === 'source')
                write(staged.directory, 'SOURCE_SHA.txt', '3'.repeat(40))
            else
                fs.unlinkSync(
                    path.join(staged.directory, RUNTIME_COMPOSITION_PATH)
                )
            expect(() =>
                f.manager.apply(staged.id, {
                    desktopHomeRoot: path.join(f.root, 'profile'),
                    libraryDirectory: path.join(f.root, 'profile/data')
                })
            ).toThrow(
                mutation === 'source'
                    ? /no longer matches/
                    : /declaration changed/
            )
            expect(fs.existsSync(path.join(f.root, 'upgrade-assistant'))).toBe(
                false
            )
        }
    )
    it('cancelling during official revalidation prevents extraction, not just the download UI', async () => {
        const f = fixture(),
            bytes = full(),
            plan = await f.manager.planRuntimeChoice('jm')
        if (plan.status !== 'preview') throw Error('Expected preview')
        const delayed = deferred<Response>()
        f.request.mockImplementationOnce(() => delayed.promise)
        const work = new UpdateDownloadTask(async () => bytes)
        const pending = work.run(
            (download, signal) =>
                f.manager.prepareRuntimeChoice(plan.id, download, signal),
            512 * 1024 * 1024
        )
        const caught = expect(pending).rejects.toThrow(/cancelled/)
        await vi.waitFor(() => expect(f.request).toHaveBeenCalledTimes(2))
        work.cancel()
        delayed.resolve(new Response(JSON.stringify(release(jm, bytes))))
        await caught
        expect(f.staged()).toBeNull()
        expect(fs.readdirSync(path.join(f.root, 'state'))).toEqual([
            'update-progress.json'
        ])
    })
    it('a late obsolete full-stage result cannot replace newer staged files or progress', async () => {
        const f = fixture(),
            a = full(core, nextSha),
            b = full(core, '3'.repeat(40)),
            wait = deferred<Response>()
        f.request.mockImplementationOnce(() => wait.promise)
        const older = f.manager.stageFullApplication(
            '0.5.1',
            release(core, a).assets[0].name,
            a
        )
        const rejected = expect(older).rejects.toThrow(/superseded/)
        f.request.mockImplementation(
            async () => new Response(JSON.stringify(release(core, b)))
        )
        const newer = await f.manager.stageFullApplication(
            '0.5.1',
            release(core, b).assets[0].name,
            b
        )
        wait.resolve(new Response(JSON.stringify(release(core, a))))
        await rejected
        expect(f.staged()?.id).toBe(newer.id)
        expect(f.manager.progress().phase).toBe('staged')
    })
    it.runIf(process.platform === 'win32')(
        'actual detached preflight accepts a valid explicit choice but does not bypass validation or start processes',
        async () => {
            const f = fixture(),
                plan = await f.manager.planRuntimeChoice('jm')
            if (plan.status !== 'preview') throw Error('Expected preview')
            await f.manager.prepareRuntimeChoice(plan.id, async () => full())
            const staged = f.staged()!,
                bootstrap = path.join(f.root, 'bootstrap')
            fs.mkdirSync(bootstrap)
            const afterPreflight = vi
                .spyOn(helperStartup, 'prepareHelperStartup')
                .mockRejectedValue(Error('SYNTHETIC_AFTER_VALID_PREFLIGHT'))
            const cwd = process.cwd()
            const changeDirectory = vi.spyOn(process, 'chdir').mockImplementation(() => {})
            const input = {
                applicationRoot: f.app,
                stagedApplicationRoot: staged.directory,
                backupRoot: path.join(f.root, 'backup'),
                bootstrapRoot: bootstrap,
                desktopHomeRoot: path.join(f.root, 'profile'),
                libraryDirectory: path.join(f.root, 'profile/data'),
                parentPid: 1,
                instanceFile: path.join(f.root, 'instance.json'),
                progressFile: path.join(f.root, 'progress.json'),
                targetVersion: staged.targetVersion,
                targetSourceSha: staged.targetSourceSha,
                runtimeComposition: jm,
                runtimeChoice: staged.runtimeChoice,
                healthTimeoutMs: 1
            }
            await expect(runFullApplicationUpgrade(input)).rejects.toThrow(
                /SYNTHETIC_AFTER_VALID_PREFLIGHT/
            )
            expect(changeDirectory).toHaveBeenCalledWith(bootstrap)
            expect(process.cwd()).toBe(cwd)
            expect(afterPreflight).toHaveBeenCalledTimes(1)
            expect(fs.existsSync(input.backupRoot)).toBe(false)
            const tampered = {
                ...input,
                runtimeChoice: {
                    ...staged.runtimeChoice!,
                    archiveName: 'evil.zip'
                }
            }
            await expect(
                runFullApplicationUpgrade(tampered)
            ).rejects.toThrow(/no longer matches/)
            expect(changeDirectory).toHaveBeenCalledTimes(2)
            expect(process.cwd()).toBe(cwd)
            expect(afterPreflight).toHaveBeenCalledTimes(1)
        }
    )
})

describe('scoped official discovery, HTTP authority and cancellation ownership', () => {
    it('forwards aborts through metadata/body work and releases linked listeners', () => {
        const a = new AbortController(),
            b = new AbortController(),
            remove = vi.spyOn(a.signal, 'removeEventListener')
        const scope = createUpdateAbortScope([a.signal, b.signal])
        expect(scope.signal.aborted).toBe(false)
        b.abort()
        expect(scope.signal.aborted).toBe(true)
        scope.dispose()
        expect(remove).toHaveBeenCalledTimes(1)
        expect(createUpdateAbortScope([b.signal]).signal.aborted).toBe(true)
    })
    it('uses the official checksum fallback without falling back to a different runtime variant', async () => {
        const bytes = full(),
            name = release(jm, bytes).assets[0].name
        const request = vi.fn(async (input: RequestInfo | URL) => {
            if (String(input).includes('api.github.com'))
                throw Error('synthetic API offline')
            const response = new Response(digest(bytes) + '  ' + name + '\n')
            Object.defineProperty(response, 'url', {
                value: 'https://github.com/Saber-Alter-Lily/pica-library/releases/download/v0.5.1/SHA256SUMS.txt'
            })
            return response
        })
        expect(await discoverRuntimeChoiceRelease(jm, request)).toMatchObject({
            archiveName: name,
            sha256: digest(bytes),
            bytes: null
        })
        await expect(
            discoverRuntimeChoiceRelease(core, request)
        ).rejects.toThrow(/no valid official checksum/)
    })
    it.each([
        'https://evil.invalid/Saber-Alter-Lily/pica-library/releases/download/v0.5.1/SHA256SUMS.txt',
        'https://github.com/other/repo/releases/download/v0.5.1/SHA256SUMS.txt'
    ])('refuses a wrong checksum authority %s', async (url) => {
        const request = vi.fn(async () => {
            const response = new Response('')
            Object.defineProperty(response, 'url', { value: url })
            return response
        })
        await expect(discoverRuntimeChoiceRelease(jm, request)).rejects.toThrow(
            /redirect/
        )
    })
    it('a cancelled old task cannot clear the new task or admit a third task', async () => {
        const a = deferred<Buffer>(),
            b = deferred<Buffer>()
        const download = new UpdateDownloadTask(async (url) =>
            url === 'synthetic-a' ? a.promise : b.promise
        )
        const first = download.run((get) => get('synthetic-a', 'a'), 10)
        const rejected = expect(first).rejects.toThrow(/cancelled/)
        download.cancel()
        const second = download.run((get) => get('synthetic-b', 'b'), 10)
        a.reject(Error('old download failed'))
        await rejected
        expect(download.progress()).toMatchObject({
            phase: 'downloading',
            targetVersion: 'b'
        })
        await expect(
            download.run((get) => get('synthetic-c'), 10)
        ).rejects.toThrow(/already running/)
        b.resolve(Buffer.from('new'))
        expect(await second).toEqual(Buffer.from('new'))
        expect(download.progress()).toBeNull()
    })
    it('propagates the owning request disconnect to the actual package transport', async () => {
        const disconnected = new AbortController(),
            bytes = deferred<Buffer>(),
            observed: AbortSignal[] = []
        const transport = new UpdateDownloadTask(
            async (_url, _limit, _progress, signal) => {
                observed.push(signal)
                return bytes.promise
            }
        )
        const pending = transport.run(
            (get) => get('synthetic-package'),
            10,
            undefined,
            disconnected.signal
        )
        const outcome = pending.then(
            () => 'completed',
            (error: Error) => error.name
        )
        disconnected.abort()
        const transportWasAborted = observed[0].aborted
        bytes.resolve(Buffer.from('synthetic'))
        expect(await outcome).toBe('AbortError')
        expect(transportWasAborted).toBe(true)
        expect(transport.progress()?.phase).toBe('cancelled')
    })
    it('does not start a package transport for an already disconnected request and removes its listener', async () => {
        const disconnected = new AbortController(),
            request = vi.fn(async () => Buffer.from('synthetic')),
            transport = new UpdateDownloadTask(request),
            removed = vi.spyOn(disconnected.signal, 'removeEventListener')
        await transport.run(
            (get) => get('synthetic'),
            10,
            undefined,
            disconnected.signal
        )
        expect(removed).toHaveBeenCalledWith('abort', expect.any(Function))
        disconnected.abort()
        await expect(
            transport.run(
                (get) => get('must-not-start'),
                10,
                undefined,
                disconnected.signal
            )
        ).rejects.toThrow(/cancelled/)
        expect(request).toHaveBeenCalledTimes(1)
    })
    it.each([
        ['0.5.1', '0.5.0'],
        ['0.5.0-postrc.test', '0.5.1'],
        ['0.5.0', '9007199254740992.0.0']
    ])(
        'refuses invalid/downgrade choice version %s -> %s',
        (current, target) => {
            expect(() =>
                validateRuntimeChoiceVersion(current, target)
            ).toThrow()
        }
    )
    it('keeps explicit command inputs closed and requires loopback origin plus a real CSRF token', () => {
        const auth = {
            method: 'POST',
            search: '',
            peer: '127.0.0.1',
            host: '127.0.0.1:4789',
            origin: 'http://127.0.0.1:4789',
            token: 'synthetic-csrf',
            expectedToken: 'synthetic-csrf'
        }
        expect(runtimeChoiceAuthority(auth)).toBe(true)
        for (const extra of [
            { method: 'GET' },
            { search: '?automatic=1' },
            { peer: '192.168.1.1' },
            { origin: undefined },
            { token: undefined, expectedToken: undefined },
            { host: 'evil.invalid:4789', origin: 'http://evil.invalid:4789' }
        ])
            expect(runtimeChoiceAuthority({ ...auth, ...extra })).toBe(false)
        expect(
            runtimeChoiceCommand(RUNTIME_CHOICE_ROUTES[0], { choice: 'jm' })
        ).toEqual({ action: 'plan', choice: 'jm' })
        for (const value of [
            { choice: ['jm'] },
            { choice: 'jm', enabled: true },
            { choice: 'pica' },
            null,
            []
        ])
            expect(() =>
                runtimeChoiceCommand(RUNTIME_CHOICE_ROUTES[0], value)
            ).toThrow()
        expect(() =>
            runtimeChoiceCommand(RUNTIME_CHOICE_ROUTES[1], {
                id: randomUUID(),
                confirmed: true
            })
        ).toThrow()
    })
    it('binds a receipt to current/staged/source/version/hash/expiry and rejects extra enablement data', () => {
        const now = Date.now(),
            receipt: RuntimeChoiceReceipt = {
                kind: 'user-selected-runtime-composition',
                id: randomUUID(),
                from: core,
                to: jm,
                sourceSha: sha,
                sourceVersion: '0.5.0',
                targetSourceSha: nextSha,
                targetVersion: '0.5.1',
                archiveName: release(jm, full()).assets[0].name,
                archiveSha256: digest(full()),
                validUntil: now + RUNTIME_CHOICE_TTL_MS
            }
        const context = {
            current: core,
            staged: jm,
            sourceSha: sha,
            targetSourceSha: nextSha,
            targetVersion: '0.5.1',
            expectedArchiveSha256: receipt.archiveSha256,
            now
        }
        expect(() =>
            validateRuntimeChoiceReceipt(receipt, context)
        ).not.toThrow()
        for (const patch of [
            { validUntil: now },
            { archiveSha256: '0'.repeat(64) },
            { to: core },
            { sourceSha: nextSha },
            { targetVersion: '0.4.9' },
            { id: '-'.repeat(36) }
        ])
            expect(() =>
                validateRuntimeChoiceReceipt({ ...receipt, ...patch }, context)
            ).toThrow()
        expect(() =>
            validateRuntimeChoiceReceipt(
                { ...receipt, enabled: true } as RuntimeChoiceReceipt,
                context
            )
        ).toThrow(/Invalid/)
    })
})
