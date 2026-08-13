import { randomBytes } from 'node:crypto'
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import type { Server } from 'node:http'
import { LibraryDatabase } from '../library/database'
import {
    startLibraryServer,
    type DesktopServerController
} from '../library/server'
import { LibraryService } from '../library/service'
import { serializeBrowserLiteDataPackage } from '../library/bundle-export'
import { Pica } from '../sdk'
import { PRODUCT_VERSION } from '../version'
import {
    buildConfig,
    connectionProxy,
    credentialedProxy,
    loadConfig,
    saveConfig
} from './config'
import { DpapiCredentialStore } from './credentials'
import { InstanceLock } from './instance'
import { DesktopLog } from './logging'
import { desktopPaths } from './paths'
import type { DesktopConfig, SetupInput, StoredCredentials } from './types'
import {
    launchBrowser,
    sanitizedChildEnv,
    showBrowserFallback,
    windowsExecutable
} from './child-process'
import { connectionCredentials } from './connection'
import { assertLibraryChangeAllowed } from './lifecycle'
import {
    isLoopbackListening,
    knownProxyPorts,
    proxyCandidates,
    redactProxyUrl
} from './proxy-detection'

const args = new Set(process.argv.slice(2))
const paths = desktopPaths()
for (const directory of [
    paths.root,
    paths.data,
    paths.cache,
    paths.logs,
    paths.runtimeState
])
    fs.mkdirSync(directory, { recursive: true })
const log = new DesktopLog(paths.logs)
const credentialsStore = new DpapiCredentialStore(paths.credentials)
const instance = new InstanceLock(paths.lock, paths.instance)
let config = loadConfig(paths.config)
let credentials: StoredCredentials | null = null
let server: Server | null = null
let database: LibraryDatabase | null = null
let service: LibraryService | null = null
let stopping = false
let currentUrl = ''
let lastBrowserLiteExportDirectory: string | null = null
let lastBrowserLiteExportAt: string | null = null

function showStartupError() {
    if (process.platform !== 'win32') return
    const script = `[void][Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms');$m=[Console]::In.ReadToEnd();[Windows.Forms.MessageBox]::Show($m,'Pica Library',[Windows.Forms.MessageBoxButtons]::OK,[Windows.Forms.MessageBoxIcon]::Error) | Out-Null`
    spawnSync(
        windowsExecutable(
            'System32',
            'WindowsPowerShell',
            'v1.0',
            'powershell.exe'
        ),
        [
            '-NoLogo',
            '-NoProfile',
            '-NonInteractive',
            '-STA',
            '-Command',
            script
        ],
        {
            input: `Pica Library 无法启动 / could not start.\n\n请查看诊断日志后重试 / See the diagnostic log and try again:\n${log.file}`,
            encoding: 'utf8',
            windowsHide: true,
            env: sanitizedChildEnv()
        }
    )
}

function browser(url: string) {
    if (args.has('--no-open')) return true
    return launchBrowser(url, (error) => {
        log.write(`Browser opening failed: ${String(error)}`)
        showBrowserFallback(url)
    })
}

async function identifiedHealth(url: string) {
    try {
        const response = await fetch(`${url}/api/v1/desktop/status`, {
            signal: AbortSignal.timeout(1500)
        })
        const value = (await response.json()) as { application?: string }
        return response.ok && value.application === 'Pica Library'
    } catch {
        return false
    }
}

async function waitForHealth(url: string, timeoutMs = 30_000) {
    const started = Date.now()
    while (Date.now() - started < timeoutMs) {
        if (await identifiedHealth(url)) return true
        await new Promise((resolve) => setTimeout(resolve, 150))
    }
    return false
}

async function closeEngine() {
    await service?.quiesceLocalDownloads()
    if (server) {
        const closing = server
        closing.closeIdleConnections()
        await new Promise<void>((resolve) => {
            let settled = false
            const finish = () => {
                if (settled) return
                settled = true
                resolve()
            }
            closing.close(finish)
            setTimeout(() => {
                closing.closeAllConnections()
                finish()
            }, 1_000).unref()
        })
    }
    server = null
    database?.close()
    database = null
    service = null
}

async function stop(exitCode = 0) {
    if (stopping) return
    stopping = true
    log.write('Stopping desktop engine')
    await closeEngine()
    instance.release()
    process.exitCode = exitCode
}

function applyCredentials(
    value: StoredCredentials | null,
    valueConfig: DesktopConfig | null
) {
    delete process.env.PICA_ACCOUNT
    delete process.env.PICA_PASSWORD
    delete process.env.PICA_PROXY
    if (!value) return
    process.env.PICA_ACCOUNT = value.account
    process.env.PICA_PASSWORD = value.password
    const proxy = credentialedProxy(valueConfig?.proxyUrl, value)
    if (proxy) process.env.PICA_PROXY = proxy
}

function friendlyConnectionError(error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    log.write(`Connection test failed: ${message}`)
    if (/401|unauthor|credential|account|password|sign-in/i.test(message))
        return 'AUTH_FAILED: The account or password was rejected.'
    if (/proxy/i.test(message))
        return 'PROXY_FAILED: The proxy could not connect.'
    if (/timeout|timed out/i.test(message))
        return 'TIMEOUT: The connection timed out.'
    if (/network|socket|connect|dns|tls/i.test(message))
        return 'NETWORK_FAILED: The provider could not be reached. Check your network or proxy.'
    return 'PROVIDER_UNEXPECTED: The provider returned an unexpected error.'
}

async function testConnection(input: Record<string, unknown>) {
    const { account, password } = connectionCredentials(input, credentials)
    if (!account || !password)
        throw new Error('Enter account and password first')
    const previous = process.env.PICA_PROXY
    try {
        const proxyUrl = connectionProxy(
            input.proxyUrl === undefined ? undefined : String(input.proxyUrl),
            config?.proxyUrl,
            { account, password, ...credentials }
        )
        if (proxyUrl) process.env.PICA_PROXY = proxyUrl
        else delete process.env.PICA_PROXY
        await new Pica().login(account, password)
        return { success: true }
    } catch (error) {
        throw new Error(friendlyConnectionError(error))
    } finally {
        if (previous) process.env.PICA_PROXY = previous
        else delete process.env.PICA_PROXY
    }
}

async function detectProxy(input: Record<string, unknown>) {
    const listeningPorts: number[] = []
    for (const port of knownProxyPorts())
        if (await isLoopbackListening(port)) listeningPorts.push(port)
    let windowsProxy: string | undefined
    if (process.platform === 'win32') {
        const registry = spawnSync(
            windowsExecutable('System32', 'reg.exe'),
            [
                'query',
                'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings'
            ],
            { encoding: 'utf8', windowsHide: true, env: sanitizedChildEnv() }
        )
        const enabled = /ProxyEnable\s+REG_DWORD\s+0x1/i.test(registry.stdout)
        const match =
            registry.status === 0
                ? registry.stdout.match(/ProxyServer\s+REG_SZ\s+([^\r\n]+)/i)
                : null
        if (enabled && match)
            windowsProxy = /^https?:\/\//i.test(match[1].trim())
                ? match[1].trim()
                : `http://${match[1].trim()}`
    }
    const candidates = proxyCandidates({
        saved: config?.proxyUrl,
        windows: windowsProxy,
        listeningPorts
    })
    const validated = []
    for (const candidate of candidates) {
        let usable = false
        try {
            await testConnection({ ...input, proxyUrl: candidate.url })
            usable = true
        } catch {
            // Candidate remains selectable even when provider validation fails.
        }
        validated.push({
            ...candidate,
            url: redactProxyUrl(candidate.url),
            usable
        })
        if (usable) break
    }
    return { candidates: validated }
}

async function chooseFolder() {
    if (process.platform !== 'win32') return null
    const script = `[void][Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms');$d=New-Object Windows.Forms.FolderBrowserDialog;$d.Description='选择 Pica Library 漫画保存目录'+[Environment]::NewLine+'Choose the Pica Library folder';if($d.ShowDialog() -eq 'OK'){[Console]::Out.Write($d.SelectedPath)}`
    const powershell = windowsExecutable(
        'System32',
        'WindowsPowerShell',
        'v1.0',
        'powershell.exe'
    )
    return await new Promise<string | null>((resolve, reject) => {
        const child = spawn(
            powershell,
            [
                '-NoLogo',
                '-NoProfile',
                '-NonInteractive',
                '-STA',
                '-Command',
                script
            ],
            { windowsHide: true, env: sanitizedChildEnv() }
        )
        let output = ''
        child.stdout.on('data', (chunk) => {
            output += String(chunk)
        })
        child.once('error', reject)
        child.once('exit', (code) =>
            code === 0
                ? resolve(output.trim() || null)
                : reject(new Error('Folder picker failed'))
        )
    })
}

async function chooseBrowserLitePackagePath() {
    if (process.platform !== 'win32') return null
    const script = `[void][Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms');$d=New-Object Windows.Forms.SaveFileDialog;$d.FileName='pica-library-bundle.json';$d.Filter='JSON files (*.json)|*.json';$d.DefaultExt='json';$d.AddExtension=$true;if($d.ShowDialog() -eq 'OK'){[Console]::Out.Write($d.FileName)}`
    const powershell = windowsExecutable(
        'System32',
        'WindowsPowerShell',
        'v1.0',
        'powershell.exe'
    )
    return await new Promise<string | null>((resolve, reject) => {
        const child = spawn(
            powershell,
            [
                '-NoLogo',
                '-NoProfile',
                '-NonInteractive',
                '-STA',
                '-Command',
                script
            ],
            { windowsHide: true, env: sanitizedChildEnv() }
        )
        let output = ''
        child.stdout.on('data', (chunk) => (output += String(chunk)))
        child.once('error', reject)
        child.once('exit', (code) =>
            code === 0
                ? resolve(output.trim() || null)
                : reject(new Error('File picker failed'))
        )
    })
}

function openDirectory(kind: string) {
    const allowed: Record<string, string> = {
        data: config?.libraryDirectory ?? paths.data,
        logs: paths.logs,
        ...(lastBrowserLiteExportDirectory
            ? { 'browser-lite-export': lastBrowserLiteExportDirectory }
            : {})
    }
    const directory = allowed[kind]
    if (!directory) throw new Error('Unknown directory')
    fs.mkdirSync(directory, { recursive: true })
    const child = spawn(windowsExecutable('explorer.exe'), [directory], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
        env: sanitizedChildEnv()
    })
    child.unref()
    return Promise.resolve()
}

async function startEngine(preferredPort: number) {
    const dataDir = config?.libraryDirectory ?? paths.data
    fs.mkdirSync(dataDir, { recursive: true })
    database = new LibraryDatabase(path.join(dataDir, 'library.db'))
    service = new LibraryService(database, dataDir)
    const csrfToken = randomBytes(32).toString('base64url')
    const desktop: DesktopServerController = {
        csrfToken,
        configured: () => Boolean(config && credentials),
        status: () => ({
            profile: config?.profile ?? 'balanced',
            libraryDirectory: config?.libraryDirectory ?? paths.data,
            proxyEnabled: Boolean(config?.proxyUrl),
            proxyUrl: config?.proxyUrl,
            openBrowser: config?.openBrowser ?? true,
            logsDirectory: paths.logs,
            lastSync: database?.lastCompletedSync() ?? null,
            lastExportAt: lastBrowserLiteExportAt
        }),
        save: async (input) => {
            const wasConfigured = Boolean(config && credentials)
            const previousCredentials = credentials
            const setup: SetupInput = {
                account: String(
                    input.account ?? previousCredentials?.account ?? ''
                ),
                password: String(
                    input.password ?? previousCredentials?.password ?? ''
                ),
                libraryDirectory: String(
                    input.libraryDirectory ?? config?.libraryDirectory ?? ''
                ),
                profile: String(
                    input.profile ?? config?.profile ?? 'balanced'
                ) as SetupInput['profile'],
                proxyUrl:
                    input.proxyUrl === undefined
                        ? config?.proxyUrl
                        : String(input.proxyUrl)
            }
            const built = buildConfig(setup)
            const dataChanged =
                config?.libraryDirectory !== built.config.libraryDirectory
            if (service)
                assertLibraryChangeAllowed(
                    service,
                    config?.libraryDirectory,
                    built.config.libraryDirectory
                )
            if (
                built.config.proxyUrl === config?.proxyUrl &&
                !built.credentials.proxyUsername &&
                !built.credentials.proxyPassword
            ) {
                built.credentials.proxyUsername =
                    previousCredentials?.proxyUsername
                built.credentials.proxyPassword =
                    previousCredentials?.proxyPassword
            }
            credentialsStore.save(built.credentials)
            saveConfig(paths.config, built.config)
            config = built.config
            credentials = built.credentials
            applyCredentials(credentials, config)
            if (!wasConfigured)
                desktop.csrfToken = randomBytes(32).toString('base64url')
            if (dataChanged) void restartEngine()
            return { success: true, restarting: dataChanged }
        },
        testConnection,
        detectProxy,
        chooseFolder,
        exportBrowserLitePackage: async () => {
            if (!database) throw new Error('Library is not ready')
            const lastSync = database.lastCompletedSync()
            const content = serializeBrowserLiteDataPackage(database, {
                sourceSyncedAt: lastSync?.finishedAt
            })
            const file = await chooseBrowserLitePackagePath()
            if (!file) return { success: false, cancelled: true }
            fs.writeFileSync(file, content, 'utf8')
            lastBrowserLiteExportDirectory = path.dirname(file)
            lastBrowserLiteExportAt = new Date().toISOString()
            return {
                success: true,
                fileName: 'pica-library-bundle.json',
                generatedAt: lastBrowserLiteExportAt,
                sourceSyncedAt: lastSync?.finishedAt ?? null
            }
        },
        syncAndExportBrowserLitePackage: async () => {
            if (!database || !service) throw new Error('Library is not ready')
            await service.syncFavorites()
            const recommendation = await service.recommendations({ limit: 60 })
            const lastSync = database.lastCompletedSync()
            const generatedAt = new Date().toISOString()
            const content = serializeBrowserLiteDataPackage(database, {
                generatedAt,
                sourceSyncedAt: lastSync?.finishedAt,
                profile: recommendation.profile,
                recommendations: recommendation.recommendations
            })
            const file = await chooseBrowserLitePackagePath()
            if (!file) return { success: false, cancelled: true }
            fs.writeFileSync(file, content, 'utf8')
            lastBrowserLiteExportDirectory = path.dirname(file)
            lastBrowserLiteExportAt = generatedAt
            return {
                success: true,
                fileName: 'pica-library-bundle.json',
                generatedAt,
                sourceSyncedAt: lastSync?.finishedAt ?? null
            }
        },
        openBrowserLite: async () => {
            browser(`${currentUrl}/?mode=browser-lite`)
        },
        openDirectory,
        shutdown: () => {
            void stop()
        }
    }
    try {
        const started = await startLibraryServer({
            database,
            service,
            host: '127.0.0.1',
            port: preferredPort,
            desktop
        })
        server = started.server
        currentUrl = started.url
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EADDRINUSE') throw error
        database.close()
        database = new LibraryDatabase(path.join(dataDir, 'library.db'))
        service = new LibraryService(database, dataDir)
        const started = await startLibraryServer({
            database,
            service,
            host: '127.0.0.1',
            port: 0,
            desktop
        })
        server = started.server
        currentUrl = started.url
        log.write(
            `Preferred port ${preferredPort} was unavailable; using ${currentUrl}`
        )
    }
    instance.publish(currentUrl)
    log.write(`Desktop engine ${PRODUCT_VERSION} started at ${currentUrl}`)
}

async function restartEngine() {
    if (stopping) return
    const previousUrl = currentUrl
    await closeEngine()
    if (stopping) return
    const port = currentUrl
        ? Number(new URL(currentUrl).port)
        : config?.preferredPort ?? 4789
    await startEngine(port || config?.preferredPort || 4789)
    if (await waitForHealth(currentUrl)) {
        if (currentUrl !== previousUrl) browser(currentUrl)
    }
}

async function main() {
    if (!instance.acquire()) {
        const info = instance.readInfo()
        if (info && (await identifiedHealth(info.url))) {
            browser(info.url)
            return
        }
        throw new Error('Another Pica Library instance is starting')
    }
    try {
        credentials = credentialsStore.load()
    } catch (error) {
        credentials = null
        log.write(`Credential retrieval failed: ${String(error)}`)
    }
    applyCredentials(credentials, config)
    await startEngine(config?.preferredPort ?? 4789)
    browser(config && credentials ? currentUrl : `${currentUrl}/setup`)
    process.on('SIGINT', () => {
        void stop()
    })
    process.on('SIGTERM', () => {
        void stop()
    })
    process.on('uncaughtException', (error) => {
        log.write(`Fatal error: ${String(error)}`)
        void stop(1)
    })
}

main().catch(async (error) => {
    log.write(`Startup failed: ${String(error)}`)
    console.error(`Pica Library could not start. Diagnostic log: ${log.file}`)
    showStartupError()
    await stop(1)
})
