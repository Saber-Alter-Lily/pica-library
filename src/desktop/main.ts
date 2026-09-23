import { createHash, randomBytes } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import type { Server } from 'node:http'
import AdmZip from 'adm-zip'
import { LibraryDatabase } from '../library/database'
import {
    startLibraryServer,
    type DesktopServerController
} from '../library/server'
import { LibraryService } from '../library/service'
import { startMobileBridge, type MobileBridgeController } from '../mobile/bridge-server'
import { serializeBrowserLiteDataPackage } from '../library/bundle-export'
import { Pica } from '../sdk'
import { PRODUCT_VERSION } from '../version'
import { RemoteStorageDesktopManager } from '../remote-storage/desktop-manager'
import { UpdateManager } from '../update/manager'
import { EcosystemPackStore } from '../ecosystem/pack-store'
import { PersonalizationService } from '../services/personalization-service'
import { GitHubAccountAuthService } from '../services/github-account-auth'
import { DesktopEhWebLogin, type EhCapturedSession } from './eh-web-login'
import {
    buildConfig,
    connectionProxy,
    credentialedProxy,
    loadConfig,
    saveConfig
} from './config'
import { credentialStoreForPlatform } from './credentials'
import { PicaAccountError } from '../services/pica-account'
import { InstanceLock } from './instance'
import { DesktopLog } from './logging'
import { desktopPaths } from './paths'
import type { DesktopConfig, SetupInput, StoredCredentials } from './types'
import {
    launchBrowser,
    launchDirectory,
    sanitizedChildEnv,
    showBrowserFallback,
    windowsExecutable
} from './child-process'
import { connectionCredentials } from './connection'
import { desktopPlatformCapabilities } from './platform'
import { desktopRuntimeOptions } from './runtime-mode'
import { DesktopNativePicker } from './pickers'
import { findManagedBrowser } from './managed-browser'
import { assertLibraryChangeAllowed } from './lifecycle'
import {
    isLoopbackListening,
    knownProxyPorts,
    proxyCandidates,
    validateProxyCandidates
} from './proxy-detection'

const runtimeOptions = desktopRuntimeOptions()
const nativePicker = new DesktopNativePicker()
const managedEhBrowser = findManagedBrowser()
const paths = desktopPaths()
const applicationRoot = path.resolve(path.dirname(process.argv[1]), '..')
const packagedSourceFile = path.join(applicationRoot, 'SOURCE_SHA.txt')
const currentSourceSha = (() => {
    try {
        const value = fs.readFileSync(packagedSourceFile, 'utf8').trim()
        return /^[0-9a-f]{40}$/.test(value) ? value : undefined
    } catch {
        return undefined
    }
})()
const updateManager = new UpdateManager({
    currentVersion: PRODUCT_VERSION,
    currentSourceSha,
    applicationRoot,
    stateRoot: path.join(paths.runtimeState, 'updates'),
    launcherPath: path.join(applicationRoot, 'Pica Library.exe'),
    runtimePath: fs.existsSync(path.join(applicationRoot, 'runtime', 'node.exe'))
        ? path.join(applicationRoot, 'runtime', 'node.exe')
        : process.execPath,
    desktopEntryPath: process.argv[1],
    instanceFile: paths.instance
})
const ecosystemPacks = new EcosystemPackStore(paths.packs, PRODUCT_VERSION)
const personalization = new PersonalizationService(
    path.join(paths.runtimeState, 'personalization'),
    path.join(applicationRoot, 'web')
)
const githubAccountAuth = new GitHubAccountAuthService()
for (const directory of [
    paths.root,
    paths.data,
    paths.cache,
    paths.packs,
    paths.logs,
    paths.runtimeState
])
    fs.mkdirSync(directory, { recursive: true })
const log = new DesktopLog(paths.logs)
const credentialBackend = credentialStoreForPlatform(paths.credentials)
const credentialsStore = credentialBackend.store
const platformCapabilities = {
    ...desktopPlatformCapabilities(),
    secureCredentialPersistence:
        credentialBackend.status.securePersistence,
    nativeFolderPicker: nativePicker.status.folderPicker,
    nativeSavePicker: nativePicker.status.savePicker,
    managedEhWebLogin: Boolean(managedEhBrowser)
}
const instance = new InstanceLock(paths.lock, paths.instance)
let config = loadConfig(paths.config)
let credentials: StoredCredentials | null = null
let server: Server | null = null
let mobileBridge: MobileBridgeController | null = null
let database: LibraryDatabase | null = null
let service: LibraryService | null = null
let remoteStorageManager: RemoteStorageDesktopManager | null = null
let ehWebLogin: DesktopEhWebLogin | null = null
let stopping = false
let currentUrl = ''
const browserSessions = new Set<string>()
const BROWSER_CLOSE_GRACE_MS = 5_000
let browserCloseTimer: NodeJS.Timeout | null = null

function mobileBridgeMustStayAlive() {
    return Boolean(mobileBridge?.status().pairedDevices.length)
}

function cancelBrowserCloseShutdown() {
    if (!browserCloseTimer) return
    clearTimeout(browserCloseTimer)
    browserCloseTimer = null
}

function browserSessionOpened(sessionId: string) {
    if (!sessionId) return
    browserSessions.add(sessionId)
    cancelBrowserCloseShutdown()
}

function browserSessionClosed(sessionId: string) {
    if (!sessionId) return
    browserSessions.delete(sessionId)
    if (!runtimeOptions.idleBrowserShutdown) return
    if (browserSessions.size > 0 || mobileBridgeMustStayAlive()) return
    cancelBrowserCloseShutdown()
    browserCloseTimer = setTimeout(() => {
        browserCloseTimer = null
        if (
            stopping ||
            browserSessions.size > 0 ||
            mobileBridgeMustStayAlive()
        )
            return
        log.write('Last browser session closed; stopping idle desktop engine')
        void stop()
    }, BROWSER_CLOSE_GRACE_MS)
    browserCloseTimer.unref()
}
let lastBrowserLiteExportDirectory: string | null = null
let browserLiteExportProgress: {
    phase: string
    state: 'idle' | 'running' | 'complete' | 'failed'
} = { phase: 'idle', state: 'idle' }
let lastBrowserLiteExportAt: string | null = (() => {
    try {
        const value = JSON.parse(fs.readFileSync(paths.exportState, 'utf8')) as {
            generatedAt?: unknown
        }
        return typeof value.generatedAt === 'string' ? value.generatedAt : null
    } catch {
        return null
    }
})()

function saveExportState(generatedAt: string) {
    const temporary = `${paths.exportState}.tmp`
    fs.writeFileSync(temporary, JSON.stringify({ generatedAt }), {
        encoding: 'utf8',
        mode: 0o600
    })
    fs.renameSync(temporary, paths.exportState)
    lastBrowserLiteExportAt = generatedAt
}

function showStartupError() {
    if (runtimeOptions.mode === 'headless' || process.platform !== 'win32') return
    const script = `[void][Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms');$m=[Console]::In.ReadToEnd();[Windows.Forms.MessageBox]::Show($m,'Pica Library',[Windows.Forms.MessageBoxButtons]::OK,[Windows.Forms.MessageBoxIcon]::Error) | Out-Null`
    spawnSync(
        windowsExecutable(
            'System32',
            'WindowsPowerShell',
            'v1.0',
            'powershell.exe'
        ),
        ['-NoLogo', '-NoProfile', '-NonInteractive', '-STA', '-Command', script],
        {
            input: `Pica Library 无法启动 / could not start.\n\n请查看诊断日志后重试 / See the diagnostic log and try again:\n${log.file}`,
            encoding: 'utf8',
            windowsHide: true,
            env: sanitizedChildEnv()
        }
    )
}

function browser(url: string) {
    if (!runtimeOptions.openBrowser || config?.openBrowser === false) return true
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
    await mobileBridge?.close()
    mobileBridge = null
    await ehWebLogin?.cancel()
    ehWebLogin = null
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
    remoteStorageManager = null
}

async function stop(exitCode = 0) {
    if (stopping) return
    stopping = true
    cancelBrowserCloseShutdown()
    log.write('Stopping desktop engine')
    await closeEngine()
    instance.release()
    process.exitCode = exitCode
    // Most Desktop runs exit naturally once the server and workers are closed.
    // A provider preparation or other third-party handle can still outlive the
    // engine, especially after a fast headless restart. Do not let an explicit
    // user/container shutdown hang indefinitely after durable state is closed.
    const finalExit = setTimeout(() => process.exit(exitCode), 250)
    finalExit.unref()
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
    if (error instanceof PicaAccountError) return error.message
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
    const remoteAction = String(input.remoteStorageAction ?? '')
    if (remoteAction === 'inventory') {
        if (!remoteStorageManager) throw new Error('Remote storage is not ready')
        return await remoteStorageManager.inventory(input)
    }
    if (remoteAction === 'test') {
        if (!remoteStorageManager) throw new Error('Remote storage is not ready')
        return await remoteStorageManager.test(input)
    }
    if (remoteAction === 'plan') {
        if (!remoteStorageManager) throw new Error('Remote storage is not ready')
        return await remoteStorageManager.plan(input)
    }
    const mobileAction = String(input.mobileBridgeAction ?? '')
    if (mobileAction === 'rotate') {
        if (!mobileBridge) throw new Error('Mobile Bridge is not ready')
        mobileBridge.rotatePairingCode()
        return { success: true }
    }
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

let registrationInFlight = false
let lastRegistrationStarted = 0
async function registerAccount(input: Record<string, unknown>) {
    if (registrationInFlight || Date.now() - lastRegistrationStarted < 30000)
        throw new Error('注册请求正在处理或刚刚提交，请先检查结果，不要重复提交。')
    const proxyUrl = connectionProxy(
        input.proxyUrl === undefined ? undefined : String(input.proxyUrl),
        config?.proxyUrl,
        credentials ?? { account: '', password: '' }
    )
    registrationInFlight = true
    lastRegistrationStarted = Date.now()
    try {
        return await new Pica({ proxyUrl: proxyUrl || false }).register(input)
    } finally {
        registrationInFlight = false
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
            ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings'],
            { encoding: 'utf8', windowsHide: true, env: sanitizedChildEnv() }
        )
        const enabled = /ProxyEnable\s+REG_DWORD\s+0x1/i.test(registry.stdout)
        const match = registry.status === 0
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
    const validated = await validateProxyCandidates(candidates, async (url) => {
        await testConnection({ ...input, proxyUrl: url })
    })
    return { candidates: validated }
}

async function chooseFolder() {
    return await nativePicker.chooseFolder(
        '选择 Pica Library 漫画保存目录 / Choose the Pica Library folder'
    )
}

async function chooseBrowserLitePackagePath() {
    return await nativePicker.chooseSaveFile({
        title: '保存 Pica Library Browser Lite 数据包 / Save Browser Lite package',
        defaultName: 'pica-library-bundle.json',
        extension: 'json'
    })
}

async function chooseRecommendationAuditPath(generatedAt: string) {
    const stamp = generatedAt.replace(/[:.]/g, '-')
    return await nativePicker.chooseSaveFile({
        title: '保存 Pica Library 推荐审计包 / Save recommendation audit',
        defaultName: `Pica-Library-Recommendation-Audit-${stamp}.zip`,
        extension: 'zip'
    })
}

function openDirectory(kind: string) {
    const allowed: Record<string, string> = {
        data: config?.libraryDirectory ?? paths.data,
        logs: paths.logs,
        personalization: personalization.root,
        packs: paths.packs,
        ...(lastBrowserLiteExportDirectory
            ? { 'browser-lite-export': lastBrowserLiteExportDirectory }
            : {})
    }
    const directory = allowed[kind]
    if (!directory) throw new Error('Unknown directory')
    fs.mkdirSync(directory, { recursive: true })
    let launchError: unknown = null
    const started = launchDirectory(directory, (error) => {
        launchError = error
        log.write(`Directory opening failed: ${String(error)}`)
    })
    if (!started)
        throw launchError instanceof Error
            ? launchError
            : new Error('Directory opening is unavailable on this platform')
    return Promise.resolve()
}

async function persistEhSession(candidate: EhCapturedSession) {
    if (!service) throw new Error('Library is not ready')
    if (!candidate.memberId || !candidate.passHash)
        throw new Error('E-H 登录会话不完整')
    const previousSession =
        credentials?.ehMemberId && credentials?.ehPassHash
            ? {
                  memberId: credentials.ehMemberId,
                  passHash: credentials.ehPassHash,
                  igneous: credentials.ehIgneous,
                  cfClearance: credentials.ehCfClearance
              }
            : null
    service.setEhSession(candidate)
    try {
        await service.verifyEhAccount()
    } catch (error) {
        service.setEhSession(previousSession)
        throw error
    }
    const next: StoredCredentials = {
        ...(credentials ?? { account: '', password: '' }),
        ehMemberId: candidate.memberId,
        ehPassHash: candidate.passHash,
        ehIgneous: candidate.igneous,
        ehCfClearance: candidate.cfClearance
    }
    credentialsStore.save(next)
    credentials = next
    return {
        configured: true,
        verified: true,
        exHentai: await service.probeExHentai()
    }
}

async function startEngine(preferredPort: number) {
    const dataDir = config?.libraryDirectory ?? paths.data
    fs.mkdirSync(dataDir, { recursive: true })
    database = new LibraryDatabase(path.join(dataDir, 'library.db'))
    service = new LibraryService(database, dataDir)
    ehWebLogin = new DesktopEhWebLogin(
        path.join(paths.runtimeState, 'eh-web-login'),
        async (candidate) => {
            await persistEhSession(candidate)
        },
        managedEhBrowser
    )
    service.setEhSession(
        credentials?.ehMemberId && credentials?.ehPassHash
            ? {
                  memberId: credentials.ehMemberId,
                  passHash: credentials.ehPassHash,
                  igneous: credentials.ehIgneous,
                  cfClearance: credentials.ehCfClearance
              }
            : null
    )
    remoteStorageManager = new RemoteStorageDesktopManager(
        paths.remoteStorageConfig,
        credentialsStore,
        credentials,
        database,
        dataDir,
        (value) => { credentials = value }
    )
    const csrfToken = randomBytes(32).toString('base64url')
    const desktop: DesktopServerController = {
        csrfToken,
        startEhWebLogin: async () => {
            if (!ehWebLogin) throw new Error('E-H 网页登录不可用')
            return await ehWebLogin.start()
        },
        ehWebLoginStatus: () =>
            ehWebLogin?.status() ?? {
                state: 'idle',
                message: '尚未开始网页登录'
            },
        cancelEhWebLogin: async () =>
            ehWebLogin
                ? await ehWebLogin.cancel()
                : { state: 'cancelled', message: '网页登录已取消' },
        configured: () => Boolean(config && credentials),
        status: () => ({
            runtime: runtimeOptions,
            platform: platformCapabilities,
            credentialBackend: credentialBackend.status,
            nativePicker: nativePicker.status,
            managedEhBrowser: managedEhBrowser
                ? {
                      kind: managedEhBrowser.kind,
                      displayName: managedEhBrowser.displayName
                  }
                : null,
            profile: config?.profile ?? 'balanced',
            libraryDirectory: config?.libraryDirectory ?? paths.data,
            proxyEnabled: Boolean(config?.proxyUrl),
            proxyUrl: config?.proxyUrl,
            openBrowser: config?.openBrowser ?? true,
            logsDirectory: paths.logs,
            lastSync: database?.lastCompletedSync() ?? null,
            lastExportAt: lastBrowserLiteExportAt,
            browserLiteExportProgress,
            mobileBridge: mobileBridge?.status() ?? null,
            remoteStorage: remoteStorageManager?.status() ?? { configured: false, kind: 'webdav' },
            ehAccount: {
                configured: Boolean(
                    credentials?.ehMemberId && credentials?.ehPassHash
                )
            },
            personalization: {
                ...personalization.status(),
                themePacks: personalization.listThemePacks()
            }
        }),
        importThemePack: async (name, value) => {
            const themePack = personalization.importThemePack(name, value)
            personalization.activateThemePack(themePack.id)
            return {
                success: true,
                themePack,
                personalization: {
                    ...personalization.status(),
                    themePacks: personalization.listThemePacks()
                }
            }
        },
        save: async (input) => {
            const ehAccountAction = String(input.ehAccountAction ?? '')
            if (ehAccountAction) {
                if (!service) throw new Error('Library is not ready')
                if (ehAccountAction === 'save-session') {
                    const candidate: EhCapturedSession = {
                        memberId: String(input.memberId ?? '').trim(),
                        passHash: String(input.passHash ?? '').trim(),
                        igneous: String(input.igneous ?? '').trim() || undefined,
                        cfClearance:
                            String(input.cfClearance ?? '').trim() || undefined
                    }
                    return {
                        success: true,
                        ehAccount: await persistEhSession(candidate)
                    }
                }
                if (ehAccountAction === 'clear-session') {
                    const next = {
                        ...(credentials ?? { account: '', password: '' }),
                        ehMemberId: undefined,
                        ehPassHash: undefined,
                        ehIgneous: undefined,
                        ehCfClearance: undefined
                    }
                    credentialsStore.save(next)
                    credentials = next
                    service.setEhSession(null)
                    return {
                        success: true,
                        ehAccount: { configured: false, exHentai: 'UNAVAILABLE' }
                    }
                }
                if (ehAccountAction === 'verify-session')
                    return {
                        success: true,
                        ehAccount: {
                            configured: service.ehAccountStatus().configured,
                            verified: true,
                            ...(await service.verifyEhAccount()),
                            exHentai: await service.probeExHentai()
                        }
                    }
                if (ehAccountAction === 'probe-exh')
                    return {
                        success: true,
                        ehAccount: {
                            configured: service.ehAccountStatus().configured,
                            exHentai: await service.probeExHentai()
                        }
                    }
                if (ehAccountAction === 'sync-favorites')
                    return {
                        success: true,
                        ehAccount: {
                            configured: service.ehAccountStatus().configured,
                            sync: await service.syncEhFavorites()
                        }
                    }
                throw new Error('Unknown E-H account action')
            }
            const themeAction = String(input.personalizationAction ?? '')
            if (themeAction === 'export-theme-creator-kit') {
                const kit = personalization.createThemeCreatorKit({
                    description: input.description,
                    references: input.references
                })
                return {
                    success: true,
                    fileName: kit.fileName,
                    size: kit.size,
                    references: kit.references,
                    dataBase64: kit.buffer.toString('base64')
                }
            }
            if (themeAction === 'activate-theme') {
                return {
                    success: true,
                    personalization: personalization.activateThemePack(String(input.themeId ?? ''))
                }
            }
            if (themeAction === 'deactivate-theme') {
                return {
                    success: true,
                    personalization: personalization.deactivateThemePack()
                }
            }
            if (themeAction === 'theme-descriptor') {
                return {
                    success: true,
                    theme: personalization.themeDescriptor(String(input.themeId ?? ''))
                }
            }
            const remoteAction = String(input.remoteStorageAction ?? '')
            if (remoteAction === 'save') {
                if (!remoteStorageManager) throw new Error('Remote storage is not ready')
                return remoteStorageManager.save(input)
            }
            if (remoteAction === 'sync') {
                if (!remoteStorageManager) throw new Error('Remote storage is not ready')
                return await remoteStorageManager.sync(input)
            }
            if (
                remoteAction === 'pause-sync' ||
                remoteAction === 'resume-sync' ||
                remoteAction === 'cancel-sync'
            ) {
                if (!remoteStorageManager) throw new Error('Remote storage is not ready')
                return {
                    success: true,
                    syncProgress: remoteStorageManager.syncControl(
                        remoteAction === 'pause-sync'
                            ? 'pause'
                            : remoteAction === 'resume-sync'
                              ? 'resume'
                              : 'cancel'
                    )
                }
            }
            if (remoteAction === 'delete-remote') {
                if (!remoteStorageManager) throw new Error('Remote storage is not ready')
                return await remoteStorageManager.deleteCopies(input)
            }
            const personalizationAction = String(input.personalizationAction ?? '')
            if (personalizationAction === 'verify-star')
                throw new Error('公开用户名 Star 验证已停用，请使用 GitHub 账号认证')
            if (personalizationAction === 'github-auth-start') {
                return { success: true, githubAuth: await githubAccountAuth.start() }
            }
            if (personalizationAction === 'github-auth-poll') {
                const githubAuth = await githubAccountAuth.poll(input.flowId)
                if (githubAuth.state === 'complete') {
                    const personalizationStatus = personalization.installAuthenticatedStarProof(githubAuth.identity)
                    return {
                        success: true,
                        githubAuth: { state: 'complete' },
                        personalization: personalizationStatus
                    }
                }
                return { success: true, githubAuth }
            }
            if (personalizationAction === 'import-theme') {
                const filename = String(input.fileName ?? 'theme.pica-theme')
                const encoded = String(input.dataBase64 ?? '')
                if (!encoded || encoded.length > 9 * 1024 * 1024)
                    throw new Error('Theme pack upload is too large')
                return {
                    success: true,
                    themePack: personalization.importThemePack(
                        filename,
                        Buffer.from(encoded, 'base64')
                    ),
                    personalization: {
                        ...personalization.status(),
                        themePacks: personalization.listThemePacks()
                    }
                }
            }
            if (personalizationAction === 'install-entitlement') {
                const text = String(input.entitlementJson ?? '')
                if (!text || text.length > 256 * 1024)
                    throw new Error('Supporter entitlement is invalid')
                return {
                    success: true,
                    personalization: personalization.installEntitlement(text)
                }
            }
            const wasConfigured = Boolean(config && credentials)
            const previousCredentials = credentials
            const setup: SetupInput = {
                account: String(input.account ?? previousCredentials?.account ?? ''),
                password: String(input.password ?? previousCredentials?.password ?? ''),
                libraryDirectory: String(input.libraryDirectory ?? config?.libraryDirectory ?? ''),
                profile: String(input.profile ?? config?.profile ?? 'balanced') as SetupInput['profile'],
                proxyUrl: input.proxyUrl === undefined ? config?.proxyUrl : String(input.proxyUrl)
            }
            const built = buildConfig(setup)
            const dataChanged = config?.libraryDirectory !== built.config.libraryDirectory
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
                built.credentials.proxyUsername = previousCredentials?.proxyUsername
                built.credentials.proxyPassword = previousCredentials?.proxyPassword
            }
            built.credentials.remoteStorageUsername = previousCredentials?.remoteStorageUsername
            built.credentials.remoteStoragePassword = previousCredentials?.remoteStoragePassword
            built.credentials.ehMemberId = previousCredentials?.ehMemberId
            built.credentials.ehPassHash = previousCredentials?.ehPassHash
            built.credentials.ehIgneous = previousCredentials?.ehIgneous
            built.credentials.ehCfClearance = previousCredentials?.ehCfClearance
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
        registerAccount,
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
            saveExportState(new Date().toISOString())
            return {
                success: true,
                fileName: 'pica-library-bundle.json',
                generatedAt: lastBrowserLiteExportAt,
                sourceSyncedAt: lastSync?.finishedAt ?? null
            }
        },
        exportRecommendationAudit: async (input = {}) => {
            if (!database || !service) throw new Error('Library is not ready')
            const generatedAt = new Date().toISOString()
            const appSessionId = String(input.appSessionId ?? '').trim() || null
            const events = database.listUserEvents({ limit: 10000 })
            const catalog = database.listComics({ limit: 10000 }).map((comic) => ({
                comicId: comic.comicId,
                title: comic.title,
                author: comic.author,
                canonicalAuthor: comic.canonicalAuthor ?? null,
                tags: comic.tags,
                categories: comic.categories,
                providerId: comic.providerId ?? null,
                isFavorite: comic.isFavorite,
                inLibrary: comic.inLibrary,
                downloadedPictures: comic.downloadedPictures,
                firstSeenAt: comic.firstSeenAt,
                lastSeenAt: comic.lastSeenAt
            }))
            const policy = service.recommendationV5Snapshot()
            const timescales = service.recommendationV5PreferenceTimescales(
                appSessionId,
                10000
            )
            const behavior = service.recommendationV5BehaviorEvidence(10000)
            const channels = service.recommendationV5CandidateChannels(
                appSessionId,
                10000
            )
            const servingComposition =
                service.recommendationServingCompositionV3()
            const shadowRuns = service.recommendationV5ShadowRuns(500)
            const evaluation = service.recommendationV5EvaluationSummary(
                500,
                30,
                3,
                50
            )
            const manifest = {
                schemaVersion: 2,
                kind: 'pica-library-recommendation-audit',
                generatedAt,
                productVersion: PRODUCT_VERSION,
                sourceSha: currentSourceSha ?? null,
                appSessionId,
                includes: [
                    'manifest.json',
                    'policy_snapshot.json',
                    'preference_timescales.json',
                    'candidate_channels.json',
                    'serving_composition.json',
                    'behavior_evidence_v5.json',
                    'user_events.json',
                    'shadow_runs.json',
                    'evaluation_snapshot.json',
                    'catalog_minimal.json',
                    'README.txt'
                ],
                excludes: [
                    'pica_password',
                    'pica_token',
                    'eh_cookies',
                    'github_token',
                    'webdav_credentials',
                    'comic_images',
                    'downloaded_files'
                ]
            }
            const zip = new AdmZip()
            const addJson = (name: string, value: unknown) =>
                zip.addFile(
                    name,
                    Buffer.from(JSON.stringify(value, null, 2), 'utf8')
                )
            addJson('manifest.json', manifest)
            addJson('policy_snapshot.json', policy)
            addJson('preference_timescales.json', timescales)
            addJson('candidate_channels.json', channels)
            addJson('serving_composition.json', servingComposition)
            addJson('behavior_evidence_v5.json', behavior)
            addJson('user_events.json', events)
            addJson('shadow_runs.json', shadowRuns)
            addJson('evaluation_snapshot.json', evaluation)
            addJson('catalog_minimal.json', catalog)
            zip.addFile(
                'README.txt',
                Buffer.from(
                    [
                        'Pica Library Recommendation Audit Export',
                        '',
                        'This package contains allowlisted recommendation and interaction audit data only.',
                        'preference_timescales.json is generated for the appSessionId recorded in manifest.json when the export is requested from the active Web session.',
                        'candidate_channels.json describes the V5 shadow planner and is not the serving recommendation batch.',
                        'serving_composition.json describes the persisted Final V3 serving batch without allocating or regenerating a recommendation batch.',
                        'It intentionally excludes account passwords, provider tokens/cookies, GitHub credentials, WebDAV credentials, comic images, and downloaded manga files.',
                        'Share this ZIP only when you intentionally want another person or analysis tool to review recommendation behavior.',
                        ''
                    ].join('\n'),
                    'utf8'
                )
            )
            const buffer = zip.toBuffer()
            const file = await chooseRecommendationAuditPath(generatedAt)
            if (!file) return { success: false, cancelled: true }
            fs.writeFileSync(file, buffer)
            return {
                success: true,
                fileName: path.basename(file),
                generatedAt,
                sizeBytes: buffer.byteLength,
                sha256: createHash('sha256').update(buffer).digest('hex')
            }
        },
        syncAndExportBrowserLitePackage: async () => {
            if (!database || !service) throw new Error('Library is not ready')
            try {
                browserLiteExportProgress = { phase: 'sync-favorites', state: 'running' }
                await service.syncFavorites()
                browserLiteExportProgress = { phase: 'update-library', state: 'running' }
                const lastSync = database.lastCompletedSync()
                browserLiteExportProgress = { phase: 'prepare-recommendations', state: 'running' }
                const recommendation = await service.recommendations({ limit: 100 })
                browserLiteExportProgress = { phase: 'generate-bundle', state: 'running' }
                const generatedAt = new Date().toISOString()
                const content = serializeBrowserLiteDataPackage(database, {
                    generatedAt,
                    sourceSyncedAt: lastSync?.finishedAt,
                    profile: recommendation.profile,
                    recommendations: recommendation.recommendations.slice(0, 60),
                    recommendationSessions: [
                        recommendation.recommendations.slice(0, 60),
                        recommendation.recommendations.slice(60, 100)
                    ].filter((session) => session.length > 0)
                })
                browserLiteExportProgress = { phase: 'choose-save-location', state: 'running' }
                const file = await chooseBrowserLitePackagePath()
                if (!file) {
                    browserLiteExportProgress = { phase: 'cancelled', state: 'idle' }
                    return { success: false, cancelled: true }
                }
                browserLiteExportProgress = { phase: 'write-file', state: 'running' }
                fs.writeFileSync(file, content, 'utf8')
                lastBrowserLiteExportDirectory = path.dirname(file)
                saveExportState(generatedAt)
                browserLiteExportProgress = { phase: 'complete', state: 'complete' }
                return {
                    success: true,
                    fileName: 'pica-library-bundle.json',
                    generatedAt,
                    sourceSyncedAt: lastSync?.finishedAt ?? null
                }
            } catch (error) {
                browserLiteExportProgress = { phase: 'failed', state: 'failed' }
                throw error
            }
        },
        openBrowserLite: async () => { browser(`${currentUrl}/?mode=browser-lite`) },
        openDirectory,
        ecosystemPackInventory: () => ecosystemPacks.inventory(),
        checkForUpdate: async () => updateManager.checkForUpdate(),
        stageUpdate: async (name, value) => updateManager.stage(name, value),
        applyUpdate: async (id) => {
            const result = updateManager.apply(id)
            setTimeout(() => void stop(), 150)
            return result
        },
        updateProgress: () => updateManager.progress(),
        browserSessionOpened,
        browserSessionClosed,
        shutdown: () => { void stop() }
    }
    try {
        const started = await startLibraryServer({
            database,
            service,
            host: '127.0.0.1',
            port: preferredPort,
            desktop,
            cacheDir: paths.cache
        })
        server = started.server
        currentUrl = started.url
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EADDRINUSE') throw error
        database.close()
        database = new LibraryDatabase(path.join(dataDir, 'library.db'))
        service = new LibraryService(database, dataDir)
    service.setEhSession(
        credentials?.ehMemberId && credentials?.ehPassHash
            ? {
                  memberId: credentials.ehMemberId,
                  passHash: credentials.ehPassHash,
                  igneous: credentials.ehIgneous,
                  cfClearance: credentials.ehCfClearance
              }
            : null
    )
        remoteStorageManager = new RemoteStorageDesktopManager(
            paths.remoteStorageConfig, credentialsStore, credentials, database, dataDir,
            (value) => { credentials = value }
        )
        const started = await startLibraryServer({
            database,
            service,
            host: '127.0.0.1',
            port: 0,
            desktop,
            cacheDir: paths.cache
        })
        server = started.server
        currentUrl = started.url
        log.write(`Preferred port ${preferredPort} was unavailable; using ${currentUrl}`)
    }
    if (runtimeOptions.mobileBridge) {
        try {
            mobileBridge = await startMobileBridge({
                database: database!,
                service: service!,
                host: '0.0.0.0',
                port: 7788,
                stateFile: path.join(paths.runtimeState, 'mobile-bridge.json'),
                accountStatus: () => ({
                    pica: {
                        configured: Boolean(
                            credentials?.account?.trim() &&
                                credentials?.password
                        )
                    },
                    eh: {
                        configured: Boolean(
                            credentials?.ehMemberId &&
                                credentials?.ehPassHash
                        )
                    }
                })
            })
            const mobile = mobileBridge.status()
            log.write(
                `Mobile Bridge started at ${
                    mobile.addresses.join(', ') || `port ${mobile.port}`
                }`
            )
        } catch (error) {
            mobileBridge = null
            log.write(`Mobile Bridge unavailable: ${String(error)}`)
        }
    } else {
        mobileBridge = null
        log.write('Mobile Bridge disabled in headless mode; pass --mobile-bridge to enable it')
    }
    instance.publish(currentUrl)
    log.write(
        `Desktop engine ${PRODUCT_VERSION} started at ${currentUrl} [${runtimeOptions.mode}]`
    )
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
    process.on('SIGINT', () => { void stop() })
    process.on('SIGTERM', () => { void stop() })
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
