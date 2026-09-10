import fs from 'node:fs'
import path from 'node:path'
import type {
    DesktopConfig,
    DownloadProfile,
    SetupInput,
    StoredCredentials
} from './types'

const profiles = new Set<DownloadProfile>(['conservative', 'balanced', 'fast'])

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
    if (!path.isAbsolute(input.libraryDirectory))
        throw new Error('Choose an absolute library folder')
    if (!profiles.has(input.profile))
        throw new Error('Choose a supported download profile')
    safeProxy(input.proxyUrl)
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
            proxyUrl: proxy.publicUrl
        },
        credentials: {
            account: input.account.trim(),
            password: input.password,
            proxyUsername: proxy.username,
            proxyPassword: proxy.password
        }
    }
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
    return value
}

export function saveConfig(file: string, config: DesktopConfig) {
    const serialized = JSON.stringify(config, null, 2)
    if (
        /password|account|username|authorization|cookie|token/i.test(serialized)
    )
        throw new Error('Refusing to write sensitive fields to config')
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
