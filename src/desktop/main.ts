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
            input: `Pica Library could not start.\n\nSee the diagnostic log and try again:\n${log.file}`,
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
        return 'The account or password was rejected.'
    if (/proxy/i.test(message)) return 'The proxy could not connect.'
    if (/timeout|network|socket|connect|dns|tls/i.test(message))
        return 'The provider could not be reached. Check your network or proxy.'
    return 'The provider returned an unexpected error.'
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

async function chooseFolder() {
    if (process.platform !== 'win32') return null
    const script = `[void][Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms');$d=New-Object Windows.Forms.FolderBrowserDialog;$d.Description='Choose your Pica Library folder';if($d.ShowDialog() -eq 'OK'){[Console]::Out.Write($d.SelectedPath)}`
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

function openDirectory(kind: string) {
    const allowed: Record<string, string> = {
        data: config?.libraryDirectory ?? paths.data,
        logs: paths.logs
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
            logsDirectory: paths.logs
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
            if (dataChanged) setTimeout(() => restartEngine(), 150)
            return { success: true, restarting: dataChanged }
        },
        testConnection,
        chooseFolder,
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
    await closeEngine()
    if (stopping) return
    await startEngine(config?.preferredPort ?? 4789)
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
