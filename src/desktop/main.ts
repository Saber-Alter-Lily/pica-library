import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { applyUpdateAndScheduleShutdown } from './update-command'
import { exportRecommendationAuditV5 } from '../services/recommendation-audit-export'
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
import { RuntimeResourceCoordinator } from '../runtime/resource-coordinator'
import { desktopRuntimeTaskDiagnostics } from '../runtime/desktop-task-diagnostics'
import {
    readRemoteApiToken,
    startRemoteApiGateway,
    type RemoteApiGateway
} from '../remote-api/gateway'
import { remoteApiConfiguration } from '../remote-api/config'
import { UpdateManager } from '../update/manager'
import { updateTargetFromRuntime } from '../update/target'
import { EcosystemPackStore } from '../ecosystem/pack-store'
import type { PersonalizationService } from '../services/personalization-service'
import { initializeOwnedDesktopProfile } from './profile-initialization'
import { GitHubAccountAuthService } from '../services/github-account-auth'
import { DesktopEhWebLogin, type EhCapturedSession } from './eh-web-login'
import {
    buildSettingsConfig,
    hasStoredCredentials,
    buildLocalConfig,
    mergePicaSetupCredentials,
    connectionProxy,
    credentialedProxy,
    connectionEnvironment,
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
import { mobileBridgeOptIn, parseMobileBridgeChoice } from './mobile-bridge-policy'
import { normalizeReaderSettings, parseReaderSettings } from '../../web/reader-settings.js'
import { DesktopNativePicker } from './pickers'
import { findManagedBrowser } from './managed-browser'
import { assertLibraryChangeAllowed } from './lifecycle'
import { SourceRuntime } from '../sources/source-policy'
import { sourcePolicyForConfig } from './config'
import { saveSourceChoices } from './source-settings'
import { SourceHostInspector } from '../source-hosts/inspector'
import { sourceHostHttp } from '../source-hosts/http-transport'
import { SourceHostError } from '../source-hosts/contract'
import { SourceHostConnections } from '../source-hosts/connections'
import { sourceHostStore } from './source-host-store'
import { HostedLibraryReader } from '../source-hosts/library-reader'
import { PreviewCacheManager } from '../services/preview-cache-manager'
import {
    isLoopbackListening,
    knownProxyPorts,
    proxyCandidates,
    validateProxyCandidates
} from './proxy-detection'

const runtimeOptions = desktopRuntimeOptions()
const remoteApiSettings = remoteApiConfiguration(runtimeOptions.remoteApi)
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
    assistantRoot: paths.upgradeAssistant,
    launcherPath: path.join(applicationRoot, 'Pica Library.exe'),
    runtimePath: fs.existsSync(path.join(applicationRoot, 'runtime', 'node.exe'))
        ? path.join(applicationRoot, 'runtime', 'node.exe')
        : process.execPath,
    desktopEntryPath: process.argv[1],
    instanceFile: paths.instance,
    target: updateTargetFromRuntime()
})
const ecosystemPacks = new EcosystemPackStore(paths.packs, PRODUCT_VERSION)
let personalization: PersonalizationService
const githubAccountAuth = new GitHubAccountAuthService()
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
const sources = new SourceRuntime(sourcePolicyForConfig(config))
// Constructor performs no network, discovery, process launch or persistence.
const sourceHostInspector = new SourceHostInspector(sourceHostHttp)
const sourceHostConnections = new SourceHostConnections(
    sourceHostStore(path.join(path.dirname(paths.config), 'source-hosts.json')),
    sourceHostInspector,
    () => randomUUID()
)
let credentials: StoredCredentials | null = null
let hostedReader: HostedLibraryReader | null = null
let server: Server | null = null
let mobileBridge: MobileBridgeController | null = null
let mobileBridgeEpoch = 0
let mobileBridgeSettingsBusy = false
let engineReady = false
let remoteApiGateway: RemoteApiGateway | null = null
let database: LibraryDatabase | null = null
let service: LibraryService | null = null
let remoteStorageManager: RemoteStorageDesktopManager | null = null
let ehWebLogin: DesktopEhWebLogin | null = null
let stopping = false
let currentUrl = ''
const browserSessions = new Set<string>()
const BROWSER_CLOSE_GRACE_MS = 5_000
const MOBILE_BRIDGE_ACTIVITY_GRACE_MS = 30_000
const SHUTDOWN_HARD_DEADLINE_MS = 35_000
const SHUTDOWN_FINAL_HANDLE_GRACE_MS = 250
const ACTIVE_DESKTOP_TASK_STATES = new Set([
    'running',
    'pausing',
    'paused',
    'cancelling'
])
let browserCloseTimer: NodeJS.Timeout | null = null
let browserCloseLeaseKey = ''

function activeDesktopTaskState(value: unknown) {
    return ACTIVE_DESKTOP_TASK_STATES.has(String(value ?? ''))
}

function mobileBridgeHasActiveLease(now = Date.now()) {
    const mobile = mobileBridge?.status()
    if (!mobile) return false
    if (mobile.activeRequests > 0) return true
    const lastActivity = Date.parse(mobile.lastActivityAt ?? '')
    return (
        Number.isFinite(lastActivity) &&
        now - lastActivity <= MOBILE_BRIDGE_ACTIVITY_GRACE_MS
    )
}

function activeDesktopWorkLeases() {
    const leases: string[] = []
    if (sourceHostInspector.busy) leases.push('source-host-inspection')
    if (sourceHostConnections.busy) leases.push('saved-source-host-inspection')
    if (hostedReader?.busy) leases.push('host-library-reader')
    if (
        database?.hasActiveDownloadJobs('LOCAL') ||
        service?.localDownloadRuntime().running
    )
        leases.push('local-downloads')
    if (activeDesktopTaskState(service?.favoritesSyncProgress().state))
        leases.push('favorites-sync')
    if (activeDesktopTaskState(service?.recommendationBuildProgress().state))
        leases.push('recommendation-build')
    if (
        activeDesktopTaskState(
            remoteStorageManager?.status().syncProgress?.state
        )
    )
        leases.push('remote-sync')
    if (browserLiteExportProgress.state === 'running')
        leases.push('browser-lite-export')
    if (mobileBridgeHasActiveLease()) leases.push('mobile-bridge-activity')
    for (const task of service?.runtimeResourceProfile().active ?? [])
        leases.push(`runtime:${task.taskType}`)
    return [...new Set(leases)]
}

function cancelBrowserCloseShutdown() {
    if (!browserCloseTimer) return
    clearTimeout(browserCloseTimer)
    browserCloseTimer = null
}

function scheduleBrowserCloseShutdown() {
    if (
        stopping ||
        !runtimeOptions.idleBrowserShutdown ||
        browserSessions.size > 0
    )
        return
    cancelBrowserCloseShutdown()
    browserCloseTimer = setTimeout(() => {
        browserCloseTimer = null
        if (stopping || browserSessions.size > 0) return
        const leases = activeDesktopWorkLeases()
        if (leases.length > 0) {
            const leaseKey = leases.join(',')
            if (leaseKey !== browserCloseLeaseKey) {
                browserCloseLeaseKey = leaseKey
                log.write(
                    `Browser UI closed; keeping desktop engine alive for: ${leases.join(', ')}`
                )
            }
            scheduleBrowserCloseShutdown()
            return
        }
        browserCloseLeaseKey = ''
        log.write('Last browser session closed; stopping idle desktop engine')
        void stop()
    }, BROWSER_CLOSE_GRACE_MS)
    browserCloseTimer.unref()
}

function browserSessionOpened(sessionId: string) {
    if (!sessionId) return
    browserSessions.add(sessionId)
    browserCloseLeaseKey = ''
    cancelBrowserCloseShutdown()
}

function browserSessionClosed(sessionId: string) {
    if (!sessionId) return
    browserSessions.delete(sessionId)
    scheduleBrowserCloseShutdown()
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

function shutdownReason(error: unknown) {
    return error instanceof Error ? error.message : String(error)
}

async function shutdownStep(
    label: string,
    action: () => Promise<void> | void,
    errors: string[]
) {
    try {
        await action()
    } catch (error) {
        const reason = shutdownReason(error)
        errors.push(`${label}: ${reason}`)
        log.write(`Shutdown: ${label} failed: ${reason}`)
    }
}

async function closeEngine() {
    engineReady = false
    mobileBridgeEpoch++
    const errors: string[] = []
    sourceHostInspector.cancel()
    sourceHostConnections.cancel()
    hostedReader?.close(); hostedReader = null

    log.write('Shutdown: closing Remote API gateway')
    await shutdownStep(
        'Remote API gateway',
        async () => {
            await remoteApiGateway?.close()
        },
        errors
    )
    remoteApiGateway = null

    log.write('Shutdown: closing Mobile Bridge')
    await shutdownStep(
        'Mobile Bridge',
        async () => {
            await mobileBridge?.close()
        },
        errors
    )
    mobileBridge = null

    log.write('Shutdown: closing managed E-H login')
    await shutdownStep(
        'managed E-H login',
        async () => {
            await ehWebLogin?.cancel()
        },
        errors
    )
    ehWebLogin = null

    log.write('Shutdown: quiescing local downloads')
    await shutdownStep(
        'local download quiesce',
        async () => {
            await service?.quiesceLocalDownloads()
            log.write('Shutdown: local downloads quiesced')
        },
        errors
    )

    if (server) {
        log.write('Shutdown: closing local HTTP server')
        const closing = server
        await shutdownStep(
            'local HTTP server',
            async () => {
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
                        log.write(
                            'Shutdown: forcing remaining local HTTP connections closed'
                        )
                        closing.closeAllConnections()
                        finish()
                    }, 1_000)
                })
                log.write('Shutdown: local HTTP server closed')
            },
            errors
        )
    }
    server = null

    log.write('Shutdown: closing database')
    await shutdownStep(
        'database',
        () => {
            database?.close()
        },
        errors
    )
    database = null
    service = null
    remoteStorageManager = null
    log.write('Shutdown: engine resources closed')
    return errors
}

function releaseInstanceLock(errors: string[]) {
    try {
        instance.release()
    } catch (error) {
        const reason = shutdownReason(error)
        errors.push(`instance lock: ${reason}`)
        log.write(`Shutdown: instance lock release failed: ${reason}`)
    }
}

async function stop(exitCode = 0) {
    if (stopping) {
        log.write(
            'Shutdown: stop request ignored because shutdown is already in progress'
        )
        return
    }
    stopping = true
    sourceHostInspector.close()
    sourceHostConnections.close()
    cancelBrowserCloseShutdown()
    process.exitCode = exitCode

    const hardExit = setTimeout(() => {
        log.write(
            `Shutdown: hard deadline ${SHUTDOWN_HARD_DEADLINE_MS} ms reached; forcing process exit`
        )
        try {
            instance.release()
        } catch (error) {
            log.write(
                `Shutdown: instance lock release at hard deadline failed: ${shutdownReason(error)}`
            )
        }
        process.exit(exitCode)
    }, SHUTDOWN_HARD_DEADLINE_MS)
    hardExit.unref()

    log.write('Stopping desktop engine')
    const errors: string[] = []
    try {
        errors.push(...(await closeEngine()))
    } catch (error) {
        const reason = shutdownReason(error)
        errors.push(`unexpected closeEngine failure: ${reason}`)
        log.write(`Shutdown: unexpected closeEngine failure: ${reason}`)
    }

    releaseInstanceLock(errors)
    clearTimeout(hardExit)

    if (errors.length > 0)
        log.write(
            `Shutdown: cleanup completed with ${errors.length} error(s): ${errors.join(' | ')}`
        )

    // Engine state is now closed or fault-isolated. A third-party handle can
    // still keep Node alive, so explicit shutdown gets one final short grace.
    const finalExit = setTimeout(
        () => process.exit(exitCode),
        SHUTDOWN_FINAL_HANDLE_GRACE_MS
    )
    finalExit.unref()
}

function applyCredentials(
    value: StoredCredentials | null,
    valueConfig: DesktopConfig | null
) {
    delete process.env.PICA_ACCOUNT
    delete process.env.PICA_PASSWORD
    delete process.env.PICA_PROXY
    Object.assign(process.env, connectionEnvironment(valueConfig, value))
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

async function startSelectedMobileBridge() {
    if (mobileBridge) return
    if (stopping || !database || !service || !mobileBridgeOptIn(config, runtimeOptions.mobileBridge, runtimeOptions.mode))
        throw new Error('Mobile Bridge is not explicitly enabled or the library is not ready')
    const epoch = mobileBridgeEpoch, owner = database
    const started = await startMobileBridge({
        database,
        service,
        host: '0.0.0.0',
        port: 7788,
        stateFile: path.join(paths.runtimeState, 'mobile-bridge.json'),
        accountStatus: () => ({
            pica: { enabled: sources.isEnabled('pica'), configured: Boolean(sources.isEnabled('pica') && credentials?.account?.trim() && credentials?.password) },
            eh: { enabled: sources.isEnabled('eh'), configured: Boolean(sources.isEnabled('eh') && credentials?.ehMemberId && credentials?.ehPassHash) }
        })
    })
    if (stopping || epoch !== mobileBridgeEpoch || database !== owner || !mobileBridgeOptIn(config, runtimeOptions.mobileBridge, runtimeOptions.mode)) {
        await started.close()
        throw new Error('Mobile Bridge activation was cancelled')
    }
    mobileBridge = started
    const mobile = started.status()
    log.write(`Mobile Bridge started at ${mobile.addresses.join(', ') || `port ${mobile.port}`}`)
}

async function setMobileBridgeEnabled(input: Record<string, unknown>) {
    const enabled = parseMobileBridgeChoice(input)
    if (!config || !service || !engineReady || stopping) throw new Error('Configure a ready local library before enabling LAN sharing')
    if (enabled && runtimeOptions.mode === 'headless' && !runtimeOptions.mobileBridge)
        throw new Error('Headless LAN sharing also requires --mobile-bridge')
    if (mobileBridgeSettingsBusy) throw new Error('Mobile Bridge settings are already being changed')
    mobileBridgeSettingsBusy = true
    try {
        const next = { ...config, mobileBridgeEnabled: enabled }
        mobileBridgeEpoch++
        if (enabled) {
            saveConfig(paths.config, next)
            config = next
            await startSelectedMobileBridge()
        }
        else {
            // A failed config write must not leave a user-disabled listener open.
            config = next
            await mobileBridge?.close()
            mobileBridge = null
            saveConfig(paths.config, next)
        }
        return { success: true, enabled, running: Boolean(mobileBridge) }
    } finally { mobileBridgeSettingsBusy = false }
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
    if (mobileAction) throw new Error('Unsupported Mobile Bridge action')
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
        // First-run account setup is an explicit opt-in; saved choices always win later.
        await new Pica({ sourceAccess: config ? sources.acquire : undefined }).login(account, password)
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
    if (config) sources.acquire('pica')
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
        return await new Pica({ proxyUrl: proxyUrl || false, sourceAccess: config ? sources.acquire : undefined }).register(input)
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
    const lease = sources.acquire('eh')
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
        lease.check()
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
    const runtimeResources = new RuntimeResourceCoordinator({
        mode: 'observe'
    })
    service = new LibraryService(
        database,
        dataDir,
        undefined,
        undefined,
        runtimeResources,
        sources
    )
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
    service.setJmCredentials(credentials?.jmUsername, credentials?.jmPassword)
    remoteStorageManager = new RemoteStorageDesktopManager(
        paths.remoteStorageConfig,
        credentialsStore,
        credentials,
        database,
        dataDir,
        (value) => { credentials = value },
        runtimeResources
    )
    const csrfToken = randomBytes(32).toString('base64url')
    hostedReader = new HostedLibraryReader(sourceHostConnections, database, () => new PreviewCacheManager(path.join(paths.cache, 'host-reader'), { maxBytes: 256 * 1024 * 1024, ttlMs: 24 * 60 * 60 * 1000 }))
    let startupReady = false
    const desktop: DesktopServerController = {
        csrfToken,
        hostedReader,
        inspectSourceHost: async (input, signal) => {
            if (!config || !service || !startupReady) throw new SourceHostError('SOURCE_HOST_UNAVAILABLE')
            return sourceHostInspector.inspect(input, signal)
        },
        sourceHostConnections: (input) => {
            if (!config || !service || !startupReady) throw new SourceHostError('SOURCE_HOST_UNAVAILABLE')
            return sourceHostConnections.command(input)
        },
        inspectSavedSourceHost: async (input, signal) => {
            if (!config || !service || !startupReady) throw new SourceHostError('SOURCE_HOST_UNAVAILABLE')
            return sourceHostConnections.inspect(input, signal)
        },
        startEhWebLogin: async () => {
            sources.acquire('eh')
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
        configured: () => Boolean(config),
        chooseLocalComic: async (kind) => kind === 'folder'
            ? nativePicker.chooseFolder('选择一本本地漫画文件夹 / Choose one local comic folder')
            : nativePicker.chooseComicArchive(),
        status: () => ({
            sourceHostInspection: { available: true, reader: false, libraryImport: false, extensionInstall: false, persisted: false },
            sourceHostConnections: { available: true, storage: sourceHostConnections.snapshot().storage, scope: 'inspect-only', reader: false },
            hostedLibraryReader: { available: true, scope: 'explicit-session-library-read', providerSearch: false, libraryImport: false, extensionInstall: false, native: false },
            externalSources: sources.snapshot(),
            sourcePolicyOrigin: config?.externalSources ? 'explicit' : config ? 'legacy-compatible' : 'new-local',
            startupReady,
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
            mobileBridgePreference: mobileBridgeOptIn(config, runtimeOptions.mobileBridge, runtimeOptions.mode),
            readerSettings: normalizeReaderSettings(config?.readerSettings),
            remoteApi: remoteApiGateway
                ? {
                      enabled: true,
                      host: remoteApiGateway.host,
                      port: remoteApiGateway.port,
                      transportSecurity:
                          remoteApiSettings?.transportSecurity ?? null,
                      allowedHostCount:
                          remoteApiSettings?.allowedHosts.length ?? 0,
                      allowedOriginCount:
                          remoteApiSettings?.allowedOrigins.length ?? 0,
                      webSessions: remoteApiGateway.webSessionsEnabled,
                      webShell: remoteApiGateway.webShellEnabled,
                      webPwa: remoteApiGateway.webPwaEnabled,
                      activeWebSessions:
                          remoteApiGateway.activeWebSessions()
                  }
                : {
                      enabled: false,
                      webSessions: false,
                      webShell: false,
                      webPwa: false,
                      activeWebSessions: 0
                  },
            remoteStorage: remoteStorageManager?.status() ?? { configured: false, kind: 'webdav' },
            ehAccount: {
                enabled: sources.isEnabled('eh'),
                configured: Boolean(
                    credentials?.ehMemberId && credentials?.ehPassHash
                )
            },
            picaAccount: { configured: Boolean(credentials?.account?.trim() && credentials?.password), enabled: sources.isEnabled('pica') },
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
            if (input.mobileBridgeAction !== undefined) return await setMobileBridgeEnabled(input)
            if (input.readerSettingsAction !== undefined) {
                if (!config || input.readerSettingsAction !== 'save' ||
                    Object.keys(input).some(key => !['readerSettingsAction', 'readerSettings'].includes(key)))
                    throw new Error('Invalid reader settings action')
                const readerSettings = parseReaderSettings(input.readerSettings)
                const next = { ...config, readerSettings }
                saveConfig(paths.config, next)
                config = next
                return { success: true, readerSettings }
            }
            if (input.sourceAction !== undefined) {
                if (input.sourceAction !== 'save' || !config || !service) throw new Error('Configure a local library before choosing sources')
                if (Object.keys(input).some(key => !['sourceAction', 'enabled', 'expectedRevision'].includes(key))) throw new Error('Unsupported source settings field')
                const saved = saveSourceChoices(paths.config, config, sources, input.enabled, input.expectedRevision)
                config = saved.config
                service.sourceChoicesApplied(saved.disabled)
                // Saving the policy is synchronous; no new request can slip through this await.
                if (saved.disabled.includes('eh')) await ehWebLogin?.cancel()
                return { success: true, externalSources: sources.snapshot() }
            }
            const jmAccountAction = String(input.jmAccountAction ?? '')
            if (jmAccountAction) {
                if (!service) throw new Error('Library is not ready')
                if (jmAccountAction === 'login') {
                    const username = String(input.username ?? '').trim(), password = String(input.password ?? '')
                    const identity = await service.jmLogin(username, password)
                    const remember = input.remember === true
                    const next: StoredCredentials = { ...(credentials ?? { account: '', password: '' }), jmUsername: remember ? username : undefined, jmPassword: remember ? password : undefined }
                    if (remember || credentials?.jmUsername) {
                        try { credentialsStore.save(next); credentials = next }
                        catch { await service.jmClearAccount(); throw new Error('JM 安全凭据保存失败，当前会话已退出，请重试') }
                    }
                    service.setJmCredentials(remember ? username : undefined, remember ? password : undefined)
                    return { ...identity, remembered: remember }
                }
                if (jmAccountAction === 'logout') {
                    const next: StoredCredentials = { ...(credentials ?? { account: '', password: '' }), jmUsername: undefined, jmPassword: undefined }
                    if (credentials?.jmUsername) { credentialsStore.save(next); credentials = next }
                    await service.jmClearAccount()
                    return { configured: false }
                }
                throw new Error('Unknown JM account action')
            }
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
            const wasConfigured = Boolean(config)
            if (input.setupMode !== undefined && input.setupMode !== 'local')
                throw new Error('Unsupported setup mode')
            if (input.setupMode === 'local') {
                const next = buildLocalConfig({ libraryDirectory: String(input.libraryDirectory ?? config?.libraryDirectory ?? paths.data), profile: String(input.profile ?? config?.profile ?? 'balanced') as SetupInput['profile'] }, config)
                const dataChanged = config?.libraryDirectory !== next.libraryDirectory
                if (service) assertLibraryChangeAllowed(service, config?.libraryDirectory, next.libraryDirectory)
                saveConfig(paths.config, next)
                config = next
                sources.apply(sourcePolicyForConfig(config))
                // Do not read/write/delete credentials, verify providers or generate recommendations.
                if (!wasConfigured) desktop.csrfToken = randomBytes(32).toString('base64url')
                if (dataChanged) void restartEngine()
                return { success: true, restarting: dataChanged, localOnly: true }
            }
            const previousCredentials = credentials
            const setup: SetupInput = {
                account: String(input.account ?? previousCredentials?.account ?? ''),
                password: String(input.password ?? previousCredentials?.password ?? ''),
                libraryDirectory: String(input.libraryDirectory ?? config?.libraryDirectory ?? ''),
                profile: String(input.profile ?? config?.profile ?? 'balanced') as SetupInput['profile'],
                proxyUrl: input.proxyUrl === undefined ? config?.proxyUrl : String(input.proxyUrl)
            }
            const built = buildSettingsConfig(setup, config)
            const dataChanged = config?.libraryDirectory !== built.config.libraryDirectory
            if (service)
                assertLibraryChangeAllowed(
                    service,
                    config?.libraryDirectory,
                    built.config.libraryDirectory
                )
            built.credentials = mergePicaSetupCredentials(built.credentials, previousCredentials, built.config.proxyUrl === config?.proxyUrl)
            const picaCredentialsChanged =
                previousCredentials?.account !== built.credentials.account ||
                previousCredentials?.password !== built.credentials.password
            const nextCredentials = previousCredentials || hasStoredCredentials(built.credentials) ? built.credentials : null
            if (nextCredentials) credentialsStore.save(nextCredentials)
            saveConfig(paths.config, built.config)
            config = built.config
            sources.apply(sourcePolicyForConfig(config))
            credentials = nextCredentials
            applyCredentials(credentials, config)
            if (picaCredentialsChanged) service?.resetPicaSession()
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
            const library = database, app = service
            return exportRecommendationAuditV5({
                productVersion: PRODUCT_VERSION,
                sourceSha: currentSourceSha,
                appSessionId: input.appSessionId,
                choosePath: chooseRecommendationAuditPath,
                read: {
                    userEvents: limit => library.listUserEvents({limit}),
                    catalog: limit => library.listComics({limit}),
                    policySnapshot: () => app.recommendationV5Snapshot(),
                    preferenceTimescales: (session, limit) => app.recommendationV5PreferenceTimescales(session, limit),
                    behaviorEvidence: limit => app.recommendationV5BehaviorEvidence(limit),
                    candidateChannels: (session, limit) => app.recommendationV5CandidateChannels(session, limit),
                    servingComposition: () => app.recommendationServingCompositionV3(),
                    shadowRuns: limit => app.recommendationV5ShadowRuns(limit),
                    evaluationSummary: (limit, horizon, step, targets) => app.recommendationV5EvaluationSummary(limit, horizon, step, targets)
                }
            })
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
        stageFullUpdate: async (version, name, value) =>
            updateManager.stageFullApplication(version, name, value),
        applyUpdate: (id) => applyUpdateAndScheduleShutdown(updateManager,id,{
                desktopHomeRoot: paths.root,
                libraryDirectory: config?.libraryDirectory ?? paths.data,
                currentUrl
            },stop),
        updateProgress: () => updateManager.progress(),
        runtimeTasks: () => {
            if (!service)
                return {
                    schemaVersion: 1,
                    capturedAt: new Date().toISOString(),
                    tasks: []
                }
            const remoteStatus = remoteStorageManager?.status()
            return desktopRuntimeTaskDiagnostics({
                base: service.runtimeTaskDiagnostics(),
                resources: runtimeResources.snapshot(),
                remoteStorageProgress:
                    remoteStatus &&
                    typeof remoteStatus === 'object' &&
                    'syncProgress' in remoteStatus
                        ? (remoteStatus.syncProgress as Record<string, unknown>)
                        : null,
                browserLiteExportProgress,
                lastBrowserLiteExportAt,
                ehWebLogin: ehWebLogin?.status() ?? null,
                updateProgress: updateManager.progress()
            })
        },
        browserSessionOpened,
        browserSessionClosed,
        shutdown: () => {
            log.write('Shutdown: Desktop controller request received')
            void stop()
        }
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
        service = new LibraryService(database, dataDir, undefined, undefined, runtimeResources, sources)
        service.setJmCredentials(credentials?.jmUsername, credentials?.jmPassword)
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
    if (remoteApiSettings) {
        const token = readRemoteApiToken(remoteApiSettings.tokenFile)
        remoteApiGateway = await startRemoteApiGateway({
            targetBaseUrl: currentUrl,
            host: remoteApiSettings.host,
            port: remoteApiSettings.port,
            token,
            allowedHosts: remoteApiSettings.allowedHosts,
            allowedOrigins: remoteApiSettings.allowedOrigins,
            webSessions: remoteApiSettings.webSessions,
            webRoot: path.join(applicationRoot, 'web', 'remote'),
            onAudit: (event) =>
                log.write(
                    `Remote API ${event.method} ${event.path} -> ${event.status} [${event.remoteAddress}]`
                )
        })
        log.write(
            `Authenticated Remote API started on ${remoteApiGateway.host}:${remoteApiGateway.port} [${remoteApiSettings.transportSecurity}; browser-sessions=${remoteApiGateway.webSessionsEnabled ? 'enabled' : 'disabled'}]`
        )
    } else {
        remoteApiGateway = null
    }
    if (mobileBridgeOptIn(config, runtimeOptions.mobileBridge, runtimeOptions.mode)) {
        try {
            await startSelectedMobileBridge()
        } catch (error) {
            mobileBridge = null
            log.write(`Mobile Bridge unavailable: ${String(error)}`)
        }
    } else {
        mobileBridge = null
        log.write('Mobile Bridge disabled; explicitly enable LAN sharing in Settings (or --mobile-bridge before a choice is saved)')
    }
    instance.publish(currentUrl)
    startupReady = true
    engineReady = true
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
    personalization = initializeOwnedDesktopProfile(
        instance,
        paths,
        path.join(applicationRoot, 'web')
    )
    try {
        const assistant = updateManager.preparePersistentUpgradeAssistant({
            verifyExisting: false
        })
        if (assistant.available)
            log.write(
                `Upgrade assistant registered outside application tree: ${assistant.root}`
            )
    } catch (error) {
        log.write(
            `Upgrade assistant registration unavailable: ${
                error instanceof Error ? error.message : String(error)
            }`
        )
    }
    try {
        credentials = credentialsStore.load()
    } catch (error) {
        credentials = null
        log.write(`Credential retrieval failed: ${String(error)}`)
    }
    applyCredentials(credentials, config)
    await startEngine(config?.preferredPort ?? 4789)
    browser(config ? currentUrl : `${currentUrl}/setup`)
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
