import fs from 'node:fs'
import path from 'node:path'
import { normalizeReaderSettings, parseReaderSettings } from '../../web/reader-settings.js'
import { sqliteDiskFilename } from '../storage/sqlite/filename'
import { initialSourcePolicy, normalizeSourcePolicy } from '../sources/source-policy'
import type {
    DesktopConfig,
    DownloadProfile,
    SetupInput,
    StoredCredentials
} from './types'

const profiles = new Set<DownloadProfile>(['conservative', 'balanced', 'fast'])

/** Absence in an existing config means pre-policy compatibility, not a new install. */
export function sourcePolicyForConfig(config: DesktopConfig | null | undefined) {
    return config?.externalSources === undefined
        ? initialSourcePolicy(Boolean(config))
        : normalizeSourcePolicy(config.externalSources)
}

export function safeProxy(input?: string): {
    publicUrl?: string
    username?: string
    password?: string
} {
    if (!input?.trim()) return {}
    const value = new URL(input.trim())
    if (!['http:', 'https:'].includes(value.protocol))
        throw new Error('Only HTTP and HTTPS proxies are supported')
    const username = decodeURIComponent(value.username)
    const password = decodeURIComponent(value.password)
    value.username = ''
    value.password = ''
    return {
        publicUrl: value.toString().replace(/\/$/, ''),
        username: username || undefined,
        password: password || undefined
    }
}

export function validateSetup(input: SetupInput) {
    if (!input.account.trim()) throw new Error('Enter your Pica account')
    if (!input.password) throw new Error('Enter your Pica password')
    validateLocalLibrarySetup(input)
    safeProxy(input.proxyUrl)
}

function validateLocalLibrarySetup(
    input: Pick<SetupInput, 'libraryDirectory' | 'profile'>
) {
    if (!path.isAbsolute(input.libraryDirectory))
        throw new Error('Choose an absolute library folder')
    sqliteDiskFilename(path.join(path.resolve(input.libraryDirectory), 'library.db'))
    if (!profiles.has(input.profile))
        throw new Error('Choose a supported download profile')
}

/** Local reading never requires a provider login or a secure credential backend. */
export function buildLocalConfig(
    input: Pick<SetupInput, 'libraryDirectory' | 'profile'>,
    current?: DesktopConfig | null
): DesktopConfig {
    validateLocalLibrarySetup(input)
    return {
        schemaVersion: 1,
        openBrowser: true,
        preferredPort: 4789,
        ...current,
        externalSources: sourcePolicyForConfig(current),
        libraryDirectory: path.resolve(input.libraryDirectory),
        profile: input.profile
    }
}

/** Editing one adapter must not erase another adapter's secure session. */
export function mergePicaSetupCredentials(
    next: StoredCredentials,
    previous: StoredCredentials | null,
    sameProxy: boolean
): StoredCredentials {
    const merged = {
        ...previous,
        ...next,
        proxyUsername: next.proxyUsername,
        proxyPassword: next.proxyPassword
    }
    if (sameProxy && !next.proxyUsername && !next.proxyPassword) {
        merged.proxyUsername = previous?.proxyUsername
        merged.proxyPassword = previous?.proxyPassword
    }
    return merged
}

export function buildConfig(input: SetupInput): {
    config: DesktopConfig
    credentials: StoredCredentials
} {
    validateSetup(input)
    const proxy = safeProxy(input.proxyUrl)
    return {
        config: {
            schemaVersion: 1,
            libraryDirectory: path.resolve(input.libraryDirectory),
            profile: input.profile,
            openBrowser: true,
            preferredPort: 4789,
            proxyUrl: proxy.publicUrl,
            externalSources: { schemaVersion: 1, revision: 0, enabled: ['pica'] }
        },
        credentials: {
            account: input.account.trim(),
            password: input.password,
            proxyUsername: proxy.username,
            proxyPassword: proxy.password
        }
    }
}

/** Existing local libraries can edit storage/proxy settings without creating a Pica account. */
export function buildSettingsConfig(
    input: SetupInput,
    current: DesktopConfig | null
) {
    if (input.account || input.password || !current) {
        const built = buildConfig(input)
        if (current) built.config = { ...current, ...built.config, externalSources: sourcePolicyForConfig(current) }
        return built
    }
    const proxy = safeProxy(input.proxyUrl)
    return {
        config: {
            ...buildLocalConfig(input, current),
            proxyUrl: proxy.publicUrl
        },
        credentials: {
            account: '',
            password: '',
            proxyUsername: proxy.username,
            proxyPassword: proxy.password
        } as StoredCredentials
    }
}

export function hasStoredCredentials(value: StoredCredentials) {
    return Object.values(value).some((item) =>
        typeof item === 'string'
            ? Boolean(item)
            : Boolean(
                  item && typeof item === 'object' && Object.keys(item).length
              )
    )
}

export function loadConfig(file: string): DesktopConfig | null {
    if (!fs.existsSync(file)) return null
    const value = JSON.parse(fs.readFileSync(file, 'utf8')) as DesktopConfig
    if (
        value.schemaVersion !== 1 ||
        !path.isAbsolute(value.libraryDirectory) ||
        !profiles.has(value.profile)
    )
        throw new Error('The saved configuration is invalid')
    if (value.proxyUrl) safeProxy(value.proxyUrl)
    if (value.externalSources !== undefined) value.externalSources = normalizeSourcePolicy(value.externalSources)
    if (value.mobileBridgeEnabled !== undefined && typeof value.mobileBridgeEnabled !== 'boolean')
        throw new Error('The saved Mobile Bridge choice is invalid')
    if (value.readerSettings !== undefined) value.readerSettings = normalizeReaderSettings(value.readerSettings)
    return value
}

export function saveConfig(file: string, config: DesktopConfig) {
    if (config.externalSources !== undefined) normalizeSourcePolicy(config.externalSources)
    if (config.mobileBridgeEnabled !== undefined && typeof config.mobileBridgeEnabled !== 'boolean')
        throw new Error('Invalid Mobile Bridge choice')
    if (config.readerSettings !== undefined) parseReaderSettings(config.readerSettings)
    const serialized = JSON.stringify(config, null, 2)
    const hasSecretKey = (value: unknown): boolean => Boolean(value && typeof value === 'object' &&
        Object.entries(value).some(([key,child]) => /password|account|username|authorization|cookie|token/i.test(key) || hasSecretKey(child)))
    if (hasSecretKey(config))
        throw new Error('Refusing to write sensitive fields to config')
    if (config.proxyUrl) {
        const proxy = new URL(config.proxyUrl)
        if (proxy.username || proxy.password) throw new Error('Refusing to write proxy credentials to config')
    }
    fs.mkdirSync(path.dirname(file), { recursive: true })
    const temporary = `${file}.tmp`
    fs.writeFileSync(temporary, serialized, { encoding: 'utf8', mode: 0o600 })
    fs.renameSync(temporary, file)
}

export function credentialedProxy(
    publicUrl: string | undefined,
    credentials: StoredCredentials
) {
    if (!publicUrl) return undefined
    const value = new URL(publicUrl)
    if (credentials.proxyUsername) value.username = credentials.proxyUsername
    if (credentials.proxyPassword) value.password = credentials.proxyPassword
    return value.toString().replace(/\/$/, '')
}

/** Public network settings are independent from the existence of a provider credential file. */
export function connectionEnvironment(config: DesktopConfig | null, credentials: StoredCredentials | null): Partial<Record<'PICA_ACCOUNT' | 'PICA_PASSWORD' | 'PICA_PROXY', string>> {
    const environment: Partial<Record<'PICA_ACCOUNT' | 'PICA_PASSWORD' | 'PICA_PROXY', string>> = {}
    if (credentials?.account && credentials.password) {
        environment.PICA_ACCOUNT = credentials.account
        environment.PICA_PASSWORD = credentials.password
    }
    const proxy = credentialedProxy(config?.proxyUrl, credentials ?? { account: '', password: '' })
    if (proxy) environment.PICA_PROXY = proxy
    return environment
}

export function connectionProxy(
    input: string | undefined,
    current: string | undefined,
    credentials: StoredCredentials
) {
    const selected = input === undefined ? current : input.trim() || undefined
    if (!selected) return undefined
    const parsed = safeProxy(selected)
    const sameAsCurrent = parsed.publicUrl === current
    return credentialedProxy(parsed.publicUrl, {
        account: credentials.account,
        password: credentials.password,
        proxyUsername:
            parsed.username ??
            (sameAsCurrent ? credentials.proxyUsername : undefined),
        proxyPassword:
            parsed.password ??
            (sameAsCurrent ? credentials.proxyPassword : undefined)
    })
}
