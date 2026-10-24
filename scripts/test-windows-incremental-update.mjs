import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { randomUUID, createHash } from 'node:crypto'
import { spawn, spawnSync } from 'node:child_process'
import AdmZip from 'adm-zip'

// Actual compiled Desktop/controller/helper, synthetic source-compatible asset payloads only.
// This is not a future Release, an old-helper replacement, or published OTA acceptance.
const [zipFile, version, sourceSha, selected = 'all'] = process.argv.slice(2)
if (
    process.platform !== 'win32' ||
    !zipFile ||
    !version ||
    !/^[0-9a-f]{40}$/.test(sourceSha ?? '')
)
    throw new Error('Explicit Windows package/version/source required')
const scenarios = [
    'success',
    'helper-spawn-error',
    'helper-early-exit',
    'staged-tamper',
    'application-launch-error',
    'health-failure',
    'unpublished-instance',
    'recovery-status-error'
]
if (selected !== 'all' && !scenarios.includes(selected))
    throw new Error('Unknown incremental acceptance scenario')
const zip = new AdmZip(zipFile),
    hash = (bytes) => createHash('sha256').update(bytes).digest('hex'),
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
for (const entry of zip.getEntries())
    if (
        entry.entryName.startsWith('/') ||
        entry.entryName.includes('\\') ||
        entry.entryName.includes(':') ||
        entry.entryName.split('/').some((part) => part === '..')
    )
        throw new Error('Unsafe application ZIP entry')
const rows = []

// Reuse the established synthetic SQL/state canaries, never an installed profile.
const stateProgram = String.raw`
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{DatabaseSync}=require('node:sqlite'),{createHash}=require('node:crypto');
const [action,root]=process.argv.slice(1),resolved=fs.realpathSync.native(root);
if(!/^pica-incremental-acceptance-[a-f0-9]{32}$/.test(path.basename(resolved))||fs.realpathSync.native(path.dirname(resolved))!==fs.realpathSync.native(require('node:os').tmpdir()))throw new Error('Only an owned synthetic root is permitted');
const home=path.join(root,'profile','Pica Library Post Stable RC'),data=path.join(home,'data'),file=path.join(data,'library.db'),config=path.join(home,'config','config.json'),stamp='2026-10-23T00:00:00.000Z';
const db=new DatabaseSync(file);
try{
if(action==='seed'){
fs.mkdirSync(path.dirname(config),{recursive:true});fs.writeFileSync(config,JSON.stringify({schemaVersion:1,libraryDirectory:data,profile:'balanced',openBrowser:false,preferredPort:4789,externalSources:{schemaVersion:1,revision:7,enabled:[]}},null,2));
fs.writeFileSync(path.join(home,'config','upgrade-preservation.txt'),'original synthetic configuration');
fs.mkdirSync(path.join(data,'downloads'),{recursive:true});fs.writeFileSync(path.join(data,'downloads','sentinel.bin'),'Synthetic downloaded-byte sentinel, not comic content.');
db.prepare('INSERT INTO episodes(id,comic_id,title,order_no,updated_at_source,first_seen_at,last_seen_at) VALUES(?,?,?,?,?,?,?)').run('upgrade-sentinel-ep','upgrade-sentinel-1','Synthetic chapter',1,stamp,stamp,stamp);
db.prepare('INSERT INTO reading_progress(comic_id,episode_id,page_index,updated_at) VALUES(?,?,?,?)').run('upgrade-sentinel-1','upgrade-sentinel-ep',7,stamp);
db.prepare('INSERT INTO app_state(key,value_json,updated_at) VALUES(?,?,?)').run('acceptance.synthetic.private-state',JSON.stringify({synthetic:true,privateTags:['Fixture only'],gesturePercent:300,neverARealAccount:true}),stamp);
db.prepare('INSERT INTO user_events(id,occurred_at,event_type,comic_id,source,metadata_json,created_at) VALUES(?,?,?,?,?,?,?)').run('upgrade-sentinel-event',stamp,'recommend_like','upgrade-sentinel-1','synthetic-acceptance','{}',stamp);
}else{
const sha=value=>createHash('sha256').update(value).digest('hex');
const result={config:sha(fs.readFileSync(config)),configMarker:sha(fs.readFileSync(path.join(home,'config','upgrade-preservation.txt'))),download:sha(fs.readFileSync(path.join(data,'downloads','sentinel.bin'))),comic:db.prepare('SELECT id,title,raw_author,categories_json,tags_json,is_favorite FROM comics WHERE id=?').get('upgrade-sentinel-1'),progress:db.prepare('SELECT * FROM reading_progress WHERE comic_id=?').all('upgrade-sentinel-1'),privateState:db.prepare('SELECT * FROM app_state WHERE key=?').get('acceptance.synthetic.private-state'),behavior:db.prepare('SELECT * FROM user_events WHERE id=?').get('upgrade-sentinel-event')};
if(action==='snapshot')fs.writeFileSync(path.join(root,'expected-state.json'),JSON.stringify(result));else if(action==='verify')assert.deepEqual(JSON.parse(JSON.stringify(result)),JSON.parse(fs.readFileSync(path.join(root,'expected-state.json'),'utf8')));else throw new Error('Invalid state action');
}console.log(JSON.stringify({syntheticOnly:true,userStatePreserved:true}));
}finally{db.close()}
`

async function scenario(kind) {
    const root = path.join(
        fs.realpathSync.native(os.tmpdir()),
        'pica-incremental-acceptance-' + randomUUID().replaceAll('-', '')
    )
    fs.mkdirSync(root)
    const app = path.join(root, 'application'),
        home = path.join(root, 'profile', 'Pica Library Post Stable RC'),
        data = path.join(home, 'data'),
        stateRoot = path.join(home, 'runtime-state', 'updates'),
        instanceFile = path.join(home, 'runtime-state', 'instance.json')
    const runtime = path.join(app, 'runtime', 'node.exe'),
        workerReceipt = path.join(root, 'worker-exit.json')
    const env = {
        ...process.env,
        LOCALAPPDATA: path.dirname(home),
        PICA_LIBRARY_DESKTOP_HOME: home
    }
    for (const key of Object.keys(env))
        if (key.startsWith('PICA_') || key === 'NODE_OPTIONS') delete env[key]
    env.PICA_LIBRARY_DESKTOP_HOME = home
    let instance = null,
        success = false,
        initialPid = 0
    function node(args) {
        const r = spawnSync(runtime, args, {
            cwd: app,
            env,
            encoding: 'utf8',
            windowsHide: true,
            timeout: 30000
        })
        if (r.status !== 0)
            throw new Error(
                'Owned packaged fixture command failed: ' +
                    String(r.stderr).slice(-1200)
            )
        return r.stdout
    }
    function state(action) {
        return JSON.parse(node(['-e', stateProgram, action, root]))
    }
    async function status(newPid = false) {
        for (let i = 0; i < 250; i++) {
            try {
                const value = JSON.parse(fs.readFileSync(instanceFile, 'utf8'))
                if (
                    !Number.isInteger(value.pid) ||
                    !/^http:\/\/127\.0\.0\.1:\d+$/.test(value.url) ||
                    (newPid && value.pid === initialPid)
                )
                    throw new Error('Waiting for owned replacement')
                const response = await fetch(
                    value.url + '/api/v1/desktop/status',
                    { signal: AbortSignal.timeout(2000) }
                )
                if (response.ok) {
                    const current = await response.json()
                    if (current.configured && current.startupReady) {
                        instance = value
                        return current
                    }
                }
            } catch {}
            await sleep(100)
        }
        throw new Error('Owned packaged Desktop did not become ready')
    }
    function assertOwnedPid(pid) {
        if (!Number.isInteger(pid) || pid <= 0)
            throw new Error('Invalid owned process ID')
        const r = spawnSync(
            'powershell.exe',
            [
                '-NoProfile',
                '-NonInteractive',
                '-Command',
                `[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false); Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}' | Select-Object ProcessId,ExecutablePath | ConvertTo-Json -Compress`
            ],
            { encoding: 'utf8', windowsHide: true, timeout: 15000 }
        )
        if (r.status !== 0)
            throw new Error('Could not verify process ownership')
        if (!r.stdout.trim()) return false
        const value = JSON.parse(r.stdout)
        if (
            !value.ExecutablePath ||
            !fs.realpathSync
                .native(value.ExecutablePath)
                .toLowerCase()
                .startsWith(root.toLowerCase() + path.sep)
        )
            throw new Error(
                'Refuse process outside exact synthetic acceptance root'
            )
        return true
    }
    async function post(route, body, binary = false) {
        const current = await status()
        return fetch(instance.url + route, {
            method: 'POST',
            headers: {
                'content-type': binary ? 'application/zip' : 'application/json',
                'x-pica-csrf': current.csrfToken,
                Origin: instance.url,
                ...(binary
                    ? { 'x-update-filename': 'synthetic-local-update.zip' }
                    : {})
            },
            body: binary ? body : JSON.stringify(body),
            signal: AbortSignal.timeout(25000)
        })
    }
    async function stop() {
        if (!instance) return
        const pid = instance.pid
        if (!assertOwnedPid(pid)) {
            instance = null
            return
        }
        const response = await post('/api/v1/desktop/shutdown', {})
        if (!response.ok) throw new Error('Owned shutdown failed')
        for (let i = 0; i < 150; i++) {
            try {
                process.kill(pid, 0)
            } catch {
                instance = null
                return
            }
            await sleep(100)
        }
        throw new Error('Owned Desktop remained alive; fixture retained')
    }
    async function stopRemainingOwnedProcesses() {
        const r = spawnSync(
            'powershell.exe',
            [
                '-NoProfile',
                '-NonInteractive',
                '-Command',
                `[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false); Get-CimInstance Win32_Process -Filter "Name='node.exe' OR Name='Pica Library.exe' OR Name='java.exe'" | Select-Object ProcessId,ExecutablePath | ConvertTo-Json -Compress`
            ],
            { encoding: 'utf8', windowsHide: true, timeout: 15000 }
        )
        if (r.status !== 0)
            throw new Error('Cannot verify owned teardown processes')
        const parsed = r.stdout.trim() ? JSON.parse(r.stdout) : [],
            values = Array.isArray(parsed) ? parsed : [parsed]
        const owned = values.filter((value) => {
            try {
                return (
                    value.ExecutablePath &&
                    fs.realpathSync
                        .native(value.ExecutablePath)
                        .toLowerCase()
                        .startsWith(root.toLowerCase() + path.sep)
                )
            } catch {
                return false
            }
        })
        for (const value of owned) {
            const pid = Number(value.ProcessId)
            if (!Number.isInteger(pid) || pid <= 0 || !assertOwnedPid(pid))
                continue
            try {
                process.kill(pid)
            } catch (error) {
                if (error.code !== 'ESRCH') throw error
            }
        }
        for (let attempt = 0; attempt < 100; attempt++) {
            if (
                owned.every((value) => {
                    try {
                        process.kill(Number(value.ProcessId), 0)
                        return false
                    } catch {
                        return true
                    }
                })
            )
                return
            await sleep(100)
        }
        throw new Error('An owned synthetic process remains; fixture retained')
    }
    try {
        zip.extractAllTo(app)
        if (
            fs.readFileSync(path.join(app, 'SOURCE_SHA.txt'), 'utf8').trim() !==
            sourceSha
        )
            throw new Error('Actual package source mismatch')
        const helperHash = hash(
            fs.readFileSync(path.join(app, 'app', 'updater.js'))
        )
        const csv = path.join(root, 'synthetic.csv')
        fs.writeFileSync(
            csv,
            'comic_id,title,author,categories,tags,finished,total_likes,total_views,pages_count,eps_count\nupgrade-sentinel-1,Synthetic Upgrade Sentinel,Fixture Author,Fixture,Fixture,true,1,1,12,1\n'
        )
        node([
            path.join(app, 'app', 'pica-library.js'),
            'import',
            csv,
            '--data-dir',
            data,
            '--json'
        ])
        state('seed')
        for (const [name, text] of [
            ['scoped-update-fixture.txt', 'old fixture'],
            ['scoped-retired-fixture.txt', 'retired fixture']
        ])
            fs.writeFileSync(path.join(app, 'web', name), text)
        const workerModule = path.join(root, 'worker-observer.mjs'),
            mainModule = path.join(root, 'main-fault.mjs')
        const fixtureContext = { root, home, data, kind, workerReceipt }
        fs.writeFileSync(
            workerModule,
            `
import fs from 'node:fs';import path from 'node:path';import cp from 'node:child_process';import {EventEmitter} from 'node:events';import {syncBuiltinESMExports} from 'node:module';import {DatabaseSync} from 'node:sqlite';
const context=${JSON.stringify(fixtureContext)},instruction=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
let uncaught=null;process.on('uncaughtExceptionMonitor',error=>{uncaught=error.message});process.once('exit',code=>{fs.writeFileSync(context.workerReceipt,JSON.stringify({code,uncaught,kind:context.kind,pid:process.pid,backupRoot:instruction.backupRoot}))});
if(context.kind==='unpublished-instance'){instruction.healthTimeoutMs=1500;fs.writeFileSync(process.argv[2],JSON.stringify(instruction));const original=cp.spawn;let launches=0;cp.spawn=(executable,args,options)=>{if(path.basename(executable)==='Pica Library.exe'&&++launches===1){const child=original(path.join(instruction.applicationRoot,'runtime','node.exe'),['-e','setTimeout(()=>{},60000)'],options);child.once('spawn',()=>fs.writeFileSync(path.join(context.root,'unpublished-pid.json'),JSON.stringify({pid:child.pid})));return child}throw new Error('Unidentified replacement must not trigger another launch')}}
if(context.kind==='health-failure'){instruction.healthTimeoutMs=3000;fs.writeFileSync(process.argv[2],JSON.stringify(instruction));const original=globalThis.fetch;let mutated=false;globalThis.fetch=async(input,options)=>{if(String(input).endsWith('/api/v1/capabilities')){if(!mutated&&fs.existsSync(instruction.instanceFile)){const d=new DatabaseSync(path.join(context.data,'library.db'));d.prepare('UPDATE app_state SET value_json=? WHERE key=?').run('{"synthetic":"replacement write"}','acceptance.synthetic.private-state');d.close();fs.writeFileSync(path.join(context.home,'config','upgrade-preservation.txt'),'replacement configuration');mutated=true}return Response.json({appVersion:'synthetic-unhealthy'})}return original(input,options)}}
if(['application-launch-error','recovery-status-error'].includes(context.kind)){const original=cp.spawn;let launches=0;cp.spawn=(executable,args,options)=>{if(path.basename(executable)==='Pica Library.exe'&&++launches===1){const child=new EventEmitter();child.unref=()=>{};queueMicrotask(()=>child.emit('error',Object.assign(new Error('synthetic asynchronous application EACCES'),{code:'EACCES'})));return child}return original(executable,args,options)}}
if(context.kind==='recovery-status-error'){const original=fs.writeFileSync;fs.writeFileSync=(file,bytes,...options)=>{if(file===instruction.progressFile&&/"phase":"(?:rollback|failed)"/.test(String(bytes)))throw new Error('synthetic recovery status EACCES');return original(file,bytes,...options)}}
syncBuiltinESMExports();
`
        )
        fs.writeFileSync(
            mainModule,
            `
import fs from 'node:fs';import path from 'node:path';import cp from 'node:child_process';import {EventEmitter} from 'node:events';import {syncBuiltinESMExports} from 'node:module';
const kind=${JSON.stringify(kind)},observer=${JSON.stringify(pathToFileURL(workerModule).href)},root=${JSON.stringify(root)},original=cp.spawn;
cp.spawn=(executable,args,options)=>{if(args&&/[/\\\\](?:updater|full-upgrader)\\.js$/.test(String(args[0]))){if(kind==='helper-spawn-error'){const child=new EventEmitter();child.unref=()=>{};queueMicrotask(()=>child.emit('error',Object.assign(new Error('synthetic helper EACCES'),{code:'EACCES'})));return child}if(kind==='helper-early-exit'){const child=original(executable,['-e','process.exit(23)'],options);child.once('exit',code=>fs.writeFileSync(path.join(root,'early-helper-exit.json'),JSON.stringify({code})));return child}return original(executable,['--import',observer,...args],options)}return original(executable,args,options)};
syncBuiltinESMExports();
`
        )
        node(['--check', workerModule])
        node(['--check', mainModule])
        spawn(
            runtime,
            [
                '--import',
                pathToFileURL(mainModule).href,
                path.join(app, 'app', 'desktop.js'),
                '--no-open'
            ],
            { cwd: app, env, windowsHide: true, stdio: 'ignore' }
        ).on('error', () => {})
        const current = await status()
        if (
            current.version !== version ||
            current.picaAccount?.configured ||
            current.externalSources?.enabled?.length
        )
            throw new Error('Expected current source-free isolated Desktop')
        initialPid = instance.pid
        state('snapshot')
        const caps = await (
            await fetch(instance.url + '/api/v1/capabilities', {
                signal: AbortSignal.timeout(5000)
            })
        ).json()
        const payload = {
            'SOURCE_SHA.txt': sourceSha,
            'web/scoped-update-fixture.txt': 'new fixture',
            'web/scoped-added-fixture.txt': 'added fixture'
        }
        const manifest = {
            manifestVersion: 1,
            packageType: 'local-test',
            sourceVersionRange: '=' + version,
            sourceSha,
            targetVersion: version,
            targetSourceSha: sourceSha,
            targetPlatform: 'windows',
            targetArch: 'x64',
            appApiVersion: caps.appApiVersion,
            databaseSchemaVersion: caps.databaseSchemaVersion,
            requiresFullInstall: false,
            moduleContracts: caps.moduleContracts,
            files: Object.entries(payload).map(([name, text]) => ({
                path: name,
                size: Buffer.byteLength(text),
                sha256: hash(Buffer.from(text))
            })),
            deletions: ['web/scoped-retired-fixture.txt']
        }
        const update = new AdmZip()
        update.addFile(
            'update-manifest.json',
            Buffer.from(JSON.stringify(manifest))
        )
        for (const [name, text] of Object.entries(payload))
            update.addFile(name, Buffer.from(text))
        const stagedResponse = await post(
            '/api/v1/update/stage',
            update.toBuffer(),
            true
        )
        if (!stagedResponse.ok)
            throw new Error(
                'Actual incremental staging failed: HTTP ' +
                    stagedResponse.status +
                    ' ' +
                    (await stagedResponse.text()).slice(0, 1200)
            )
        const staged = await stagedResponse.json()
        if (
            staged.requiresFullInstall ||
            staged.fileCount !== 3 ||
            staged.deletionCount !== 1
        )
            throw new Error(
                'Expected a genuine allowlisted incremental selection, never a full fallback'
            )
        if (kind === 'staged-tamper') {
            const directory = path.join(stateRoot, 'staged-' + staged.id)
            fs.writeFileSync(
                path.join(directory, 'web', 'scoped-update-fixture.txt'),
                'tampered after staging'
            )
        }
        const response = await post('/api/v1/update/apply', { id: staged.id })
        const rejected = [
            'helper-spawn-error',
            'helper-early-exit',
            'staged-tamper'
        ].includes(kind)
        let outcome = null
        if (rejected) {
            if (response.ok) throw new Error('An unready helper was accepted')
            await sleep(400)
            await status()
            if (instance.pid !== initialPid || !assertOwnedPid(initialPid))
                throw new Error(
                    'Unready helper caused the original app to exit'
                )
            if (
                fs.readFileSync(
                    path.join(app, 'web', 'scoped-update-fixture.txt'),
                    'utf8'
                ) !== 'old fixture'
            )
                throw new Error(
                    'Rejected startup modified the installed application'
                )
            const progress = JSON.parse(
                fs.readFileSync(
                    path.join(stateRoot, 'update-progress.json'),
                    'utf8'
                )
            )
            if (progress.phase !== 'failed')
                throw new Error('Rejected startup was not reported as failed')
            if (kind === 'staged-tamper') {
                outcome = JSON.parse(fs.readFileSync(workerReceipt, 'utf8'))
                if (outcome.code !== 1 || outcome.uncaught)
                    throw new Error(
                        'Staged-byte preflight did not reject cleanly'
                    )
            }
        } else {
            const accepted = await response.json()
            if (
                !response.ok ||
                !accepted.accepted ||
                accepted.mode !== 'incremental'
            )
                throw new Error(
                    'Actual controller did not accept the ready incremental helper'
                )
            for (let i = 0; i < 400; i++) {
                try {
                    outcome = JSON.parse(fs.readFileSync(workerReceipt, 'utf8'))
                    break
                } catch {}
                await sleep(100)
            }
            if (
                !outcome ||
                outcome.code !== (kind === 'success' ? 0 : 1) ||
                outcome.uncaught
            )
                throw new Error('Actual helper exit/recovery outcome mismatch')
            const retained = kind === 'unpublished-instance'
            if (!retained) await status(true)
            const old = kind !== 'success' && !retained
            if (
                fs.readFileSync(
                    path.join(app, 'web', 'scoped-update-fixture.txt'),
                    'utf8'
                ) !== (old ? 'old fixture' : 'new fixture') ||
                fs.existsSync(
                    path.join(app, 'web', 'scoped-added-fixture.txt')
                ) === old ||
                fs.existsSync(
                    path.join(app, 'web', 'scoped-retired-fixture.txt')
                ) !== old
            )
                throw new Error(
                    'Actual incremental apply/recovery file result differs'
                )
            const progress = JSON.parse(
                fs.readFileSync(
                    path.join(stateRoot, 'update-progress.json'),
                    'utf8'
                )
            )
            if (
                kind !== 'recovery-status-error' &&
                progress.phase !== (kind === 'success' ? 'complete' : 'failed')
            )
                throw new Error('Actual helper final progress mismatch')
            if (retained) {
                const unpublished = JSON.parse(
                    fs.readFileSync(
                        path.join(root, 'unpublished-pid.json'),
                        'utf8'
                    )
                )
                if (
                    !assertOwnedPid(unpublished.pid) ||
                    fs.existsSync(instanceFile) ||
                    !progress.message?.includes('exit cannot be verified') ||
                    !outcome.backupRoot.startsWith(stateRoot + path.sep)
                )
                    throw new Error('Unknown replacement did not fail closed')
                if (
                    fs.readFileSync(
                        path.join(
                            outcome.backupRoot,
                            'web',
                            'scoped-update-fixture.txt'
                        ),
                        'utf8'
                    ) !== 'old fixture' ||
                    !fs.existsSync(
                        path.join(
                            outcome.backupRoot,
                            'user-state-snapshot',
                            'snapshot.json'
                        )
                    )
                )
                    throw new Error('Unknown replacement lost recovery copies')
            }
        }
        state('verify')
        const readyFiles = fs
            .readdirSync(stateRoot)
            .filter((name) => /^helper-ready-[0-9a-f-]+\.json$/.test(name))
        const acceptedFiles = fs
            .readdirSync(stateRoot)
            .filter((name) =>
                /^helper-ready-[0-9a-f-]+\.json\.accepted$/.test(name)
            )
        if (rejected && acceptedFiles.length)
            throw new Error('Rejected helper received update authority')
        if (!rejected) {
            if (readyFiles.length !== 1 || acceptedFiles.length !== 1)
                throw new Error('Actual ready/acknowledgement pair is missing')
            const ready = JSON.parse(
                    fs.readFileSync(path.join(stateRoot, readyFiles[0]), 'utf8')
                ),
                ack = JSON.parse(
                    fs.readFileSync(
                        path.join(stateRoot, acceptedFiles[0]),
                        'utf8'
                    )
                )
            if (
                ready.kind !== 'incremental' ||
                ready.pid !== outcome.pid ||
                ready.parentPid !== initialPid ||
                JSON.stringify(ready) !== JSON.stringify(ack)
            )
                throw new Error(
                    'Actual startup authority did not bind helper/parent/mode/nonce'
                )
        }
        if (
            hash(fs.readFileSync(path.join(app, 'app', 'updater.js'))) !==
                helperHash ||
            fs.readFileSync(path.join(app, 'SOURCE_SHA.txt'), 'utf8').trim() !==
                sourceSha
        )
            throw new Error(
                'Scoped update replaced its own helper/source authority'
            )
        if (
            kind === 'helper-early-exit' &&
            JSON.parse(
                fs.readFileSync(
                    path.join(root, 'early-helper-exit.json'),
                    'utf8'
                )
            ).code !== 23
        )
            throw new Error('Actual early-exit control did not execute')
        const row = {
            scenario: kind,
            pass: true,
            sourceSha,
            selection: 'INCREMENTAL',
            fixture: 'SAME_SOURCE_ALLOWED_ASSET_PLAN_NOT_FUTURE_RELEASE',
            oldAppKeptOnStartupRejection: rejected,
            helperReadyAcknowledged: !rejected,
            originalHelperRetained: true,
            syntheticFavoritesProgressPrivateStateBehaviorConfigAndDownloadsPreserved: true,
            helperExit: outcome?.code ?? null,
            unknownInstanceRetainedWithoutOverwrite:
                kind === 'unpublished-instance',
            uncaughtHelperError: false,
            healthTimeoutOverrideMs:
                kind === 'health-failure'
                    ? 3000
                    : kind === 'unpublished-instance'
                      ? 1500
                      : null,
            publishedOtaTested: false,
            productionAccessed: false
        }
        success = true
        return row
    } finally {
        try {
            if (fs.existsSync(instanceFile))
                instance = JSON.parse(fs.readFileSync(instanceFile, 'utf8'))
            await stop()
        } catch (error) {
            success = false
            throw error
        } finally {
            await stopRemainingOwnedProcesses()
        }
        if (success) {
            const real = fs.realpathSync.native(root)
            if (
                path.dirname(real) !== fs.realpathSync.native(os.tmpdir()) ||
                !/^pica-incremental-acceptance-[a-f0-9]{32}$/.test(
                    path.basename(real)
                ) ||
                fs.lstatSync(root).isSymbolicLink()
            )
                throw new Error('Unsafe fixture cleanup')
            fs.rmSync(root, {
                recursive: true,
                force: true,
                maxRetries: 10,
                retryDelay: 100
            })
        } else console.error('Synthetic incremental fixture retained: ' + root)
    }
}
for (const name of selected === 'all' ? scenarios : [selected]) {
    const row = await scenario(name)
    rows.push(row)
    console.log(JSON.stringify(row))
}
console.log(
    JSON.stringify({
        packaged_incremental_update: 'PASS',
        source_sha: sourceSha,
        version,
        artifactSha256: hash(fs.readFileSync(zipFile)),
        syntheticOnly: true,
        productionAccessed: false,
        publishedOtaTested: false,
        rows
    })
)
