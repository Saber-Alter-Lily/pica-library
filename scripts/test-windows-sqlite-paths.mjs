import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { spawn, spawnSync } from 'node:child_process'
import AdmZip from 'adm-zip'

// Actual packaged CLI/Desktop/runtime, isolated synthetic bodies and profiles only.
const [archiveFile, version, sourceSha] = process.argv.slice(2)
if (
    process.platform !== 'win32' ||
    !archiveFile ||
    !version ||
    !/^[a-f0-9]{40}$/.test(sourceSha ?? '')
)
    throw new Error(
        'Explicit Windows package, version and exact source required'
    )
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-sqlite-acceptance-'))
const app = path.join(root, 'application')
const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5WsAAAAASUVORK5CYII=',
    'base64'
)
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const children = new Set()
let success = false

function databaseAtLength(length, label) {
    let directory = path.join(root, label, '中文 # % file names with spaces')
    while (directory.length + 11 < length) {
        const remaining = length - directory.length - 11
        directory =
            remaining === 1
                ? directory + 'x'
                : path.join(directory, 'x'.repeat(Math.min(remaining - 1, 60)))
    }
    const file = path.join(directory, 'library.db')
    if (file.length !== length)
        throw new Error('Synthetic database length mismatch')
    return file
}

function runNode(code, args, env) {
    const result = spawnSync(
        path.join(app, 'runtime/node.exe'),
        ['-e', code, ...args],
        { cwd: app, env, encoding: 'utf8', windowsHide: true, timeout: 30000 }
    )
    if (result.status !== 0)
        throw new Error('Actual packaged runtime failed: ' + result.stderr)
    return JSON.parse(result.stdout)
}

async function waitState(home, child) {
    for (let i = 0; i < 200; i++) {
        if (child.exitCode !== null)
            throw new Error('Owned packaged Desktop exited before ready')
        try {
            const instance = JSON.parse(
                fs.readFileSync(
                    path.join(home, 'runtime-state/instance.json'),
                    'utf8'
                )
            )
            if (
                instance.pid !== child.pid ||
                !/^http:\/\/127\.0\.0\.1:\d+$/.test(instance.url)
            )
                throw new Error('Foreign test instance')
            const response = await fetch(
                instance.url + '/api/v1/desktop/status',
                { signal: AbortSignal.timeout(1500) }
            )
            if (response.ok) {
                const state = await response.json()
                if (state.startupReady) return { instance, state }
            }
        } catch {}
        await sleep(100)
    }
    throw new Error('Owned packaged Desktop readiness timeout')
}

async function post(current, route, body) {
    return fetch(current.instance.url + route, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'x-pica-csrf': current.state.csrfToken,
            Origin: current.instance.url
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000)
    })
}

async function stop(current, child) {
    try {
        await post(current, '/api/v1/desktop/shutdown', {})
    } catch {}
    for (let i = 0; i < 100 && child.exitCode === null; i++) await sleep(100)
    if (child.exitCode === null)
        throw new Error('Owned packaged Desktop did not exit')
    children.delete(child)
}

try {
    new AdmZip(archiveFile).extractAllTo(app)
    if (
        fs.readFileSync(path.join(app, 'SOURCE_SHA.txt'), 'utf8').trim() !==
        sourceSha
    )
        throw new Error('Actual Windows source mismatch')
    const rows = []
    for (const length of [253, 1200, 4096]) {
        const home = path.join(root, 'profile-' + length),
            file = databaseAtLength(length, 'data-' + length),
            data = path.dirname(file)
        const env = {
            ...process.env,
            LOCALAPPDATA: path.join(root, 'local-' + length)
        }
        for (const key of Object.keys(env))
            if (key.startsWith('PICA_')) delete env[key]
        env.PICA_LIBRARY_DESKTOP_HOME = home
        fs.mkdirSync(path.join(home, 'config'), { recursive: true })
        const configFile = path.join(home, 'config/config.json')
        const config = JSON.stringify({
            schemaVersion: 1,
            libraryDirectory: data,
            profile: 'balanced',
            openBrowser: false,
            preferredPort: 0,
            externalSources: { schemaVersion: 1, revision: 0, enabled: [] }
        })
        fs.writeFileSync(configFile, config)
        fs.mkdirSync(data, { recursive: true })
        // A pre-migration database proves the existing backup still uses the
        // same physical logical filename; no URI is persisted in the profile.
        runNode(
            `const {DatabaseSync}=require('node:sqlite'),path=require('node:path');const db=new DatabaseSync('file:'+encodeURIComponent(path.toNamespacedPath(process.argv[1]))+'?vfs=win32-longpath');db.exec("CREATE TABLE synthetic_retained(value TEXT); INSERT INTO synthetic_retained VALUES ('keep-through-migration')");db.close();console.log('{}');`,
            [file],
            env
        )
        const original = path.join(root, 'original-' + length)
        fs.mkdirSync(original)
        fs.writeFileSync(path.join(original, '1.png'), png)
        const imported = spawnSync(
            path.join(app, 'runtime/node.exe'),
            [
                path.join(app, 'app/pica-library.js'),
                'local-import',
                '--path',
                original,
                '--kind',
                'folder',
                '--data-dir',
                data,
                '--confirm',
                '--json'
            ],
            {
                cwd: app,
                env,
                encoding: 'utf8',
                windowsHide: true,
                timeout: 60000
            }
        )
        if (imported.status !== 0)
            throw new Error(
                'Compiled local import failed at ' +
                    length +
                    ': ' +
                    imported.stderr
            )
        const comic = JSON.parse(imported.stdout)
        if (!comic.comicId.startsWith('local:') || comic.pages !== 1)
            throw new Error('Actual compiled import identity mismatch')
        const launch = () => {
            const child = spawn(
                path.join(app, 'runtime/node.exe'),
                [path.join(app, 'app/desktop.js'), '--headless'],
                { cwd: app, env, windowsHide: true, stdio: 'ignore' }
            )
            children.add(child)
            child.once('error', () => {})
            return child
        }
        let child = launch(),
            current = await waitState(home, child)
        if (
            current.state.version !== version ||
            current.state.picaAccount?.configured
        )
            throw new Error('Unexpected package/provider identity')
        const query = await post(current, '/api/v1/library/query', {
            providerIds: ['local'],
            scope: 'library'
        })
        const catalog = await query.json()
        if (
            !query.ok ||
            catalog.total !== 1 ||
            catalog.items[0].comicId !== comic.comicId
        )
            throw new Error('Deep catalog read failed')
        const base = current.instance.url,
            id = encodeURIComponent(comic.comicId)
        const chapters = await fetch(
            base + '/api/v1/reader/comics/' + id + '/chapters'
        ).then((r) => r.json())
        const chapter = await fetch(
            base +
                '/api/v1/reader/comics/' +
                id +
                '/chapters/' +
                encodeURIComponent(chapters[0].id)
        ).then((r) => r.json())
        const body = Buffer.from(
            await fetch(base + chapter.pages[0].url).then((r) =>
                r.arrayBuffer()
            )
        )
        if (!body.equals(png))
            throw new Error('Deep actual Reader body differs')
        const progress = await post(current, '/api/v1/reader/progress', {
            comicId: comic.comicId,
            episodeId: chapters[0].id,
            pageIndex: 0
        })
        if (!progress.ok) throw new Error('Deep reading progress did not save')
        const rejected = await post(current, '/api/v1/desktop/settings', {
            setupMode: 'local',
            libraryDirectory: 'C:\\' + 'nested\\'.repeat(6000),
            profile: 'balanced'
        })
        if (rejected.ok || fs.readFileSync(configFile, 'utf8') !== config)
            throw new Error(
                'Impossible path was accepted or changed saved configuration'
            )
        await stop(current, child)
        child = launch()
        current = await waitState(home, child)
        const resumed = await fetch(
            current.instance.url +
                '/api/v1/reader/comics/' +
                id +
                '/chapters/' +
                encodeURIComponent(chapters[0].id)
        ).then((r) => r.json())
        if (resumed.progress?.pageIndex !== 0)
            throw new Error('Deep restart lost reading state')
        const caps = await fetch(
            current.instance.url + '/api/v1/capabilities'
        ).then((r) => r.json())
        await stop(current, child)
        const backup =
            file + '.pre-migration-v' + caps.databaseSchemaVersion + '.bak'
        if (!fs.existsSync(backup) || fs.statSync(backup).size === 0)
            throw new Error('Deep pre-migration backup is missing')
        const retained = runNode(
            `const {DatabaseSync}=require('node:sqlite'),path=require('node:path');const db=new DatabaseSync('file:'+encodeURIComponent(path.toNamespacedPath(process.argv[1]))+'?vfs=win32-longpath',{readOnly:true});const value=db.prepare('SELECT value FROM synthetic_retained').get().value;db.close();console.log(JSON.stringify({value}));`,
            [file],
            env
        )
        if (
            retained.value !== 'keep-through-migration' ||
            !fs.readFileSync(path.join(original, '1.png')).equals(png) ||
            fs.existsSync(path.join(home, 'config/credentials.dat'))
        )
            throw new Error('Physical data/provider safety boundary failed')
        rows.push({
            databasePathCharacters: file.length,
            unicodeAndSpaces: true,
            literalHashAndPercent: true,
            compiledCliImport: true,
            preMigrationBackup: true,
            catalogReaderAndRestart: true,
            impossibleSettingRejectedWithoutMutation: true,
            logicalFilenameRetained: true,
            schema: caps.databaseSchemaVersion
        })
    }
    const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite')
    const lockFile = path.join(root, 'ordinary-client.db'),
        db = new DatabaseSync(lockFile)
    try {
        db.exec(
            "PRAGMA journal_mode=WAL; CREATE TABLE retained(value TEXT); BEGIN IMMEDIATE; INSERT INTO retained VALUES ('held')"
        )
        const code = `const {DatabaseSync}=require('node:sqlite'),path=require('node:path');const db=new DatabaseSync('file:'+encodeURIComponent(path.toNamespacedPath(process.argv[1]))+'?vfs=win32-longpath');try{db.exec("INSERT INTO retained VALUES ('new')");console.log(JSON.stringify({locked:false}));}catch(e){console.log(JSON.stringify({locked:e.errcode===5,code:e.errcode}));}finally{db.close()}`
        if (!runNode(code, [lockFile], process.env).locked)
            throw new Error('Cross-process default/longpath locking was lost')
        db.exec('COMMIT')
        if (
            runNode(code, [lockFile], process.env).locked ||
            db.prepare('SELECT COUNT(*) AS n FROM retained').get().n !== 2
        )
            throw new Error('Cross-process commit visibility was lost')
    } finally {
        db.close()
    }
    success = true
    console.log(
        JSON.stringify({
            packaged_sqlite_long_paths: 'PASS',
            source_sha: sourceSha,
            version,
            rows,
            crossProcessOrdinaryVfsLocks: true,
            production_accessed: false,
            synthetic_only: true,
            networkProvidersUsed: false
        })
    )
} finally {
    for (const child of children) {
        if (child.exitCode === null) child.kill()
    }
    for (
        let i = 0;
        i < 100 && [...children].some((child) => child.exitCode === null);
        i++
    )
        await sleep(100)
    if ([...children].some((child) => child.exitCode === null))
        throw new Error('Owned process cleanup incomplete; retained: ' + root)
    if (success) {
        const resolved = fs.realpathSync(root)
        if (
            path.dirname(resolved) !== fs.realpathSync(os.tmpdir()) ||
            !path.basename(resolved).startsWith('pica-sqlite-acceptance-') ||
            fs.lstatSync(root).isSymbolicLink()
        )
            throw new Error('Unsafe synthetic cleanup')
        fs.rmSync(resolved, {
            recursive: true,
            force: true,
            maxRetries: 10,
            retryDelay: 100
        })
    } else console.error('Synthetic test root retained: ' + root)
}
