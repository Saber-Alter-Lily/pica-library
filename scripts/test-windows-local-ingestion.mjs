import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import net from 'node:net'
import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import AdmZip from 'adm-zip'

// Exercise compiled CLI + actual packaged Desktop. Native dialog rendering is a separate manual gate.
const [zipFile, version, sourceSha] = process.argv.slice(2)
if (
    process.platform !== 'win32' ||
    !zipFile ||
    !version ||
    !/^[a-f0-9]{40}$/.test(sourceSha ?? '')
)
    throw new Error('Explicit Windows ZIP/version/source required')
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-local-ingestion-'))
const app = path.join(root, 'application'),
    home = path.join(root, 'profile', 'Pica Library Post Stable RC'),
    data = path.join(home, 'data')
const original = path.join(root, 'original'),
    cbz = path.join(root, 'comic.cbz'),
    instanceFile = path.join(home, 'runtime-state', 'instance.json')
const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5WsAAAAASUVORK5CYII=',
    'base64'
)
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex'),
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
let instance,
    success = false
let pairingToken
const displaySettings = {
    schemaVersion: 1,
    mode: 'single',
    direction: 'rtl',
    fit: 'height'
}
async function bridgeClosed() {
    await new Promise((resolve, reject) => {
        const socket = net.createConnection({ host: '127.0.0.1', port: 7788 })
        const finish = (error) => {
            socket.removeAllListeners()
            socket.destroy()
            error ? reject(error) : resolve()
        }
        socket.once('connect', () =>
            finish(new Error('Disabled bridge still accepts connections'))
        )
        socket.once('error', (error) =>
            finish(error.code === 'ECONNREFUSED' ? null : error)
        )
        socket.setTimeout(3000, () =>
            finish(new Error('Could not prove disabled bridge port closed'))
        )
    })
}
async function enableAndCheckPairing(first) {
    await post('/api/v1/desktop/settings', {
        mobileBridgeAction: 'set-enabled',
        enabled: true
    })
    const current = await status(),
        mobile = current.mobileBridge
    if (!mobile?.enabled || mobile.port !== 7788)
        throw new Error('Explicit bridge enable failed')
    if (first) {
        const response = await fetch('http://127.0.0.1:7788/mobile/v1/pair', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                code: mobile.pairingCode,
                deviceName: 'Synthetic Runtime Gate'
            }),
            signal: AbortSignal.timeout(5000)
        })
        if (!response.ok) throw new Error('Synthetic runtime pairing failed')
        pairingToken = (await response.json()).token
    } else if (
        !mobile.pairedDevices?.some(
            (row) => row.deviceName === 'Synthetic Runtime Gate'
        )
    )
        throw new Error('Explicit disable/restart erased pairing records')
    const response = await fetch('http://127.0.0.1:7788/mobile/v1/library', {
        headers: { authorization: 'Bearer ' + pairingToken },
        signal: AbortSignal.timeout(5000)
    })
    if (!response.ok)
        throw new Error('Preserved paired token failed after explicit enable')
    await post('/api/v1/desktop/settings', {
        mobileBridgeAction: 'set-enabled',
        enabled: false
    })
    if ((await status()).mobileBridge !== null)
        throw new Error('Disabled bridge still reported running')
    await bridgeClosed()
}
new AdmZip(zipFile).extractAllTo(app)
if (
    fs.readFileSync(path.join(app, 'SOURCE_SHA.txt'), 'utf8').trim() !==
    sourceSha
)
    throw new Error('Actual package SHA identity mismatch')
fs.mkdirSync(original)
fs.writeFileSync(path.join(original, '2.png'), png)
fs.writeFileSync(path.join(original, '10.png'), png)
const archive = new AdmZip()
archive.addFile('Chapter 1/1.png', png)
archive.writeZip(cbz)
const originalArchiveHash = sha(fs.readFileSync(cbz))
const env = { ...process.env, LOCALAPPDATA: path.dirname(home) }
for (const key of Object.keys(env)) if (key.startsWith('PICA_')) delete env[key]
env.PICA_LIBRARY_DESKTOP_HOME = home
function cli(source, kind, confirm) {
    const args = [
        path.join(app, 'app', 'pica-library.js'),
        'local-import',
        '--path',
        source,
        '--kind',
        kind,
        '--data-dir',
        data,
        '--json'
    ]
    if (confirm) args.push('--confirm')
    const result = spawnSync(path.join(app, 'runtime', 'node.exe'), args, {
        cwd: app,
        env,
        encoding: 'utf8',
        timeout: 60000,
        windowsHide: true
    })
    if (result.status !== 0)
        throw new Error(
            'Actual packaged local import CLI failed: ' + result.stderr
        )
    return JSON.parse(result.stdout)
}
async function status() {
    for (let attempt = 0; attempt < 200; attempt++) {
        try {
            const value = JSON.parse(fs.readFileSync(instanceFile, 'utf8'))
            if (value.pid && /^http:\/\/127\.0\.0\.1:\d+$/.test(value.url)) {
                instance = value
                const result = await fetch(
                    value.url + '/api/v1/desktop/status',
                    { signal: AbortSignal.timeout(3000) }
                )
                if (result.ok) return result.json()
            }
        } catch {}
        await sleep(100)
    }
    throw new Error('Owned actual Desktop did not become ready')
}
async function post(route, body) {
    const state = await status()
    const response = await fetch(instance.url + route, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'x-pica-csrf': state.csrfToken,
            Origin: instance.url
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000)
    })
    if (!response.ok) throw new Error(route + ' failed HTTP ' + response.status)
    return response.json()
}
try {
    const preview = cli(original, 'folder', false)
    if (
        !preview.confirmationRequired ||
        fs.existsSync(path.join(data, 'local-library'))
    )
        throw new Error('CLI copied before explicit confirmation')
    const folder = cli(original, 'folder', true),
        book = cli(cbz, 'cbz', true)
    if (
        !folder.comicId.startsWith('local:') ||
        !book.comicId.startsWith('local:') ||
        folder.pages !== 2 ||
        book.pages !== 1
    )
        throw new Error('Actual local inventory identity/count failed')
    spawn(path.join(app, 'Pica Library.exe'), ['--no-open'], {
        cwd: app,
        env,
        windowsHide: true,
        stdio: 'ignore'
    }).on('error', () => {})
    let current = await status()
    if (current.version !== version || current.picaAccount?.configured)
        throw new Error('Unexpected actual Desktop identity')
    if (
        current.mobileBridge !== null ||
        current.mobileBridgePreference !== false
    )
        throw new Error(
            'Fresh interactive package opened LAN sharing without opt-in'
        )
    if (!current.configured) {
        const old = current.csrfToken
        await post('/api/v1/desktop/settings', {
            setupMode: 'local',
            libraryDirectory: data,
            profile: 'balanced'
        })
        for (let i = 0; i < 200; i++) {
            current = await status()
            if (
                current.configured &&
                current.startupReady &&
                current.csrfToken !== old
            )
                break
            await sleep(100)
        }
    }
    if (
        !current.configured ||
        !current.startupReady ||
        current.picaAccount?.configured
    )
        throw new Error('Local-only setup failed')
    if (
        current.mobileBridge !== null ||
        current.mobileBridgePreference !== false
    )
        throw new Error('Local-only setup implicitly enabled LAN sharing')
    await bridgeClosed()
    await post('/api/v1/desktop/settings', {
        readerSettingsAction: 'save',
        readerSettings: displaySettings
    })
    if (
        JSON.stringify((await status()).readerSettings) !==
        JSON.stringify(displaySettings)
    )
        throw new Error('Packaged display settings did not save')
    await enableAndCheckPairing(true)
    const capabilities = await fetch(
        instance.url + '/api/v1/capabilities'
    ).then((r) => r.json())
    if (
        capabilities.moduleContracts.apis.library !== 2 ||
        capabilities.moduleContracts.apis.tags !== 2 ||
        !capabilities.features.localFileImport ||
        capabilities.features.archiveReader
    )
        throw new Error('Actual module/capability declaration failed')
    const rows = await post('/api/v1/library/query', {
        providerIds: ['local'],
        scope: 'library'
    })
    if (
        rows.total !== 2 ||
        rows.items.some((item) => item.providerId !== 'local')
    )
        throw new Error('Packaged library local scope failed')
    const read = async (id) => {
        const encoded = encodeURIComponent(id),
            chapters = await fetch(
                instance.url + '/api/v1/reader/comics/' + encoded + '/chapters'
            ).then((r) => r.json())
        const chapterResponse = await fetch(
            instance.url +
                '/api/v1/reader/comics/' +
                encoded +
                '/chapters/' +
                encodeURIComponent(chapters[0].id)
        )
        const chapter = await chapterResponse.json()
        if (
            !chapterResponse.ok ||
            !Array.isArray(chapter.pages) ||
            !chapter.pages.length
        )
            throw new Error(
                'Actual packaged Reader chapter failed: ' +
                    JSON.stringify({
                        status: chapterResponse.status,
                        body: chapter
                    })
            )
        const bytes = Buffer.from(
            await fetch(instance.url + chapter.pages[0].url).then((r) =>
                r.arrayBuffer()
            )
        )
        if (!bytes.equals(png) || !chapter.pages[0].url.includes('?v='))
            throw new Error('Compiled Reader page/cache revision failed')
        return { chapters, chapter }
    }
    const first = await read(folder.comicId)
    await read(book.comicId)
    await post('/api/v1/reader/progress', {
        comicId: folder.comicId,
        episodeId: first.chapters[0].id,
        pageIndex: 1
    })
    const cover = await fetch(
        instance.url + '/api/v1/covers/' + encodeURIComponent(folder.comicId)
    )
    if (
        cover.headers.get('cache-control') !== 'private, no-store' ||
        !Buffer.from(await cover.arrayBuffer()).equals(png)
    )
        throw new Error('Actual local cover freshness failed')
    await post('/api/v1/desktop/shutdown', {})
    for (let i = 0; i < 100; i++) {
        try {
            process.kill(instance.pid, 0)
        } catch {
            instance = null
            break
        }
        await sleep(100)
    }
    if (instance) throw new Error('Owned Desktop did not stop before reimport')
    const second = cli(original, 'folder', true)
    if (second.comicId !== folder.comicId)
        throw new Error('Reimport changed local identity')
    spawn(path.join(app, 'Pica Library.exe'), ['--no-open'], {
        cwd: app,
        env,
        windowsHide: true,
        stdio: 'ignore'
    }).on('error', () => {})
    const restarted = await status()
    if (
        restarted.mobileBridge !== null ||
        restarted.mobileBridgePreference !== false ||
        JSON.stringify(restarted.readerSettings) !==
            JSON.stringify(displaySettings)
    )
        throw new Error(
            'Restart lost display settings or restarted disabled LAN sharing'
        )
    await bridgeClosed()
    await enableAndCheckPairing(false)
    const after = await read(folder.comicId)
    if (after.chapter.progress?.pageIndex !== 1)
        throw new Error('Actual package reimport/restart lost progress')
    if (
        sha(fs.readFileSync(cbz)) !== originalArchiveHash ||
        !fs.readFileSync(path.join(original, '2.png')).equals(png) ||
        fs.existsSync(path.join(home, 'config', 'credentials.dat'))
    )
        throw new Error('Originals/credentials boundary failed')
    success = true
    process.stdout.write(
        JSON.stringify({
            packaged_local_ingestion: 'PASS',
            source_sha: sourceSha,
            version,
            folder_pages: folder.pages,
            cbz_pages: book.pages,
            preview_no_copy: true,
            local_identity: true,
            reimport_restart_progress: true,
            revisioned_body_urls: true,
            local_cover_no_store: true,
            provider_login: false,
            credentials_file_created: false,
            originals_unchanged: true,
            default_lan_off: true,
            explicit_lan_disable_restart_and_paired_token: true,
            reader_display_config_saved_restart: true,
            native_picker_manual_gate: 'PENDING',
            synthetic_only: true,
            production_accessed: false
        }) + '\n'
    )
} finally {
    if (instance) {
        try {
            await post('/api/v1/desktop/shutdown', {})
        } catch {}
        for (let i = 0; i < 100; i++) {
            try {
                process.kill(instance.pid, 0)
            } catch {
                instance = null
                break
            }
            await sleep(100)
        }
    }
    if (instance)
        throw new Error('Owned test process still alive; retained: ' + root)
    if (success) {
        const resolved = fs.realpathSync(root)
        if (
            path.dirname(resolved) !== fs.realpathSync(os.tmpdir()) ||
            !path.basename(resolved).startsWith('pica-local-ingestion-') ||
            fs.lstatSync(root).isSymbolicLink()
        )
            throw new Error('Unsafe synthetic cleanup')
        fs.rmSync(resolved, {
            recursive: true,
            force: true,
            maxRetries: 10,
            retryDelay: 100
        })
    } else process.stderr.write('Synthetic fixture retained: ' + root + '\n')
}
