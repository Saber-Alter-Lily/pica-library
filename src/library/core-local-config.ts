import fs from 'node:fs'
import path from 'node:path'
import { normalizeReaderSettings, parseReaderSettings } from '../../web/reader-settings.js'
import { sqliteDiskFilename } from '../storage/sqlite/filename'
import type { DesktopConfig, DownloadProfile, SetupInput } from '../desktop/types'

/**
 * Original Desktop local configuration validation and persistence, moved to a
 * source-neutral core. Provider policy compatibility stays at the trusted
 * Desktop composition root and is injected, never compiled into this module.
 */
const profiles = new Set<DownloadProfile>(['conservative', 'balanced', 'fast'])

export function validateCoreLocalSetup(
    input: Pick<SetupInput, 'libraryDirectory' | 'profile'>
) {
    if (!path.isAbsolute(input.libraryDirectory))
        throw new Error('Choose an absolute library folder')
    sqliteDiskFilename(path.join(path.resolve(input.libraryDirectory), 'library.db'))
    if (!profiles.has(input.profile))
        throw new Error('Choose a supported download profile')
}

export function buildCoreLocalConfig(
    input: Pick<SetupInput, 'libraryDirectory' | 'profile'>,
    current: DesktopConfig | null | undefined,
    externalSources: DesktopConfig['externalSources']
): DesktopConfig {
    validateCoreLocalSetup(input)
    return {
        schemaVersion: 1,
        openBrowser: true,
        preferredPort: 4789,
        ...current,
        externalSources,
        libraryDirectory: path.resolve(input.libraryDirectory),
        profile: input.profile
    }
}

/**
 * Source-neutral on-disk format. The source-enabled Desktop wrapper still
 * normalizes provider selection after this read for legacy compatibility.
 * This routine never creates a new DB, migrates profiles or loads credentials.
 */
export function readCoreLocalConfig(
    file: string,
    validatePublicProxy: (url: string) => unknown
): DesktopConfig | null {
    if (!fs.existsSync(file)) return null
    const value = JSON.parse(fs.readFileSync(file, 'utf8')) as DesktopConfig
    if (
        !value || value.schemaVersion !== 1 ||
        !path.isAbsolute(value.libraryDirectory) ||
        !profiles.has(value.profile)
    )
        throw new Error('The saved configuration is invalid')
    if (value.proxyUrl) validatePublicProxy(value.proxyUrl)
    if (value.mobileBridgeEnabled !== undefined &&
        typeof value.mobileBridgeEnabled !== 'boolean')
        throw new Error('The saved Mobile Bridge choice is invalid')
    if (value.readerSettings !== undefined)
        value.readerSettings = normalizeReaderSettings(value.readerSettings)
    return value
}

/** Atomically update the same original config.json without sensitive fields. */
export function writeCoreLocalConfig(file: string, config: DesktopConfig) {
    if (config.mobileBridgeEnabled !== undefined &&
        typeof config.mobileBridgeEnabled !== 'boolean')
        throw new Error('Invalid Mobile Bridge choice')
    if (config.readerSettings !== undefined)
        parseReaderSettings(config.readerSettings)
    const serialized = JSON.stringify(config, null, 2)
    const hasSecretKey = (value: unknown): boolean => Boolean(
        value && typeof value === 'object' &&
        Object.entries(value).some(([key, child]) =>
            /password|account|username|authorization|cookie|token/i.test(key) ||
            hasSecretKey(child)
        )
    )
    if (hasSecretKey(config))
        throw new Error('Refusing to write sensitive fields to config')
    if (config.proxyUrl) {
        const proxy = new URL(config.proxyUrl)
        if (proxy.username || proxy.password)
            throw new Error('Refusing to write proxy credentials to config')
    }
    fs.mkdirSync(path.dirname(file), { recursive: true })
    const temporary = `${file}.tmp`
    fs.writeFileSync(temporary, serialized, { encoding: 'utf8', mode: 0o600 })
    fs.renameSync(temporary, file)
}
