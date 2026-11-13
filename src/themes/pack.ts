import crypto from 'node:crypto'
import AdmZip from 'adm-zip'

const MAX_ARCHIVE_BYTES = 24 * 1024 * 1024

const MAX_ENTRY_BYTES = 8 * 1024 * 1024

const MAX_ENTRIES = 120

const THEME_FORMAT_VERSION = 1

export interface ThemePackInfo {
    id: string
    name: string
    author: string
    version: string
    description: string
    size: number
    sha256: string
}

function safeThemePath(value: string) {
    const normalized = value.replaceAll('\\', '/')
    if (
        !normalized ||
        normalized.startsWith('/') ||
        normalized === '..' ||
        normalized.includes('../') ||
        normalized.includes('\0')
    )
        throw new Error('Theme pack contains an unsafe path')
    return normalized
}

function allowedThemePath(value: string) {
    if (
        [
            'manifest.json',
            'palette.json',
            'layout.json',
            'components.json'
        ].includes(value)
    )
        return true
    if (!value.startsWith('assets/')) return false
    return /\.(png|jpe?g|webp)$/i.test(value)
}

export function sha256(value: Buffer) {
    return crypto.createHash('sha256').update(value).digest('hex')
}

export function readJson(zip: AdmZip, name: string) {
    const entry = zip.getEntry(name)
    if (!entry) return {}
    return JSON.parse(entry.getData().toString('utf8')) as Record<
        string,
        unknown
    >
}

function enumValue(value: unknown, allowed: readonly string[], label: string) {
    if (value === undefined) return
    if (!allowed.includes(String(value))) throw new Error(`${label} is invalid`)
}

function numberRange(value: unknown, min: number, max: number, label: string) {
    if (value === undefined) return
    const numeric = Number(value)
    if (!Number.isFinite(numeric) || numeric < min || numeric > max)
        throw new Error(`${label} is invalid`)
}

function validatePalette(value: Record<string, unknown>) {
    const color = /^#[0-9A-Fa-f]{6}$/
    for (const mode of ['light', 'dark']) {
        const palette = value[mode]
        if (palette === undefined) continue
        if (!palette || typeof palette !== 'object' || Array.isArray(palette))
            throw new Error(`${mode} palette is invalid`)
        for (const [key, raw] of Object.entries(palette))
            if (raw !== undefined && !color.test(String(raw)))
                throw new Error(`Theme color is invalid: ${mode}.${key}`)
    }
}

function validateLayout(value: Record<string, unknown>) {
    numberRange(value.cardRadiusDp, 8, 28, 'cardRadiusDp')
    numberRange(value.coverRadiusDp, 4, 24, 'coverRadiusDp')
    enumValue(value.density, ['compact', 'standard', 'comfortable'], 'density')
}

function validateComponents(value: Record<string, unknown>) {
    const typography = value.typography as Record<string, unknown> | undefined
    if (typography) {
        enumValue(
            typography.title,
            ['default', 'rounded', 'comic', 'cute'],
            'typography.title'
        )
        enumValue(
            typography.navigation,
            ['default', 'rounded', 'comic', 'cute'],
            'typography.navigation'
        )
    }
    const navigation = value.navigation as Record<string, unknown> | undefined
    if (navigation) {
        enumValue(
            navigation.selectedEffect,
            ['none', 'pill', 'glow'],
            'navigation.selectedEffect'
        )
        enumValue(
            navigation.iconScale,
            ['small', 'standard', 'large'],
            'navigation.iconScale'
        )
    }
    const progress = value.progress as Record<string, unknown> | undefined
    if (progress) {
        enumValue(
            progress.style,
            ['classic', 'star', 'mascot', 'paw'],
            'progress.style'
        )
        enumValue(progress.motion, ['none', 'bobble', 'hop'], 'progress.motion')
        enumValue(progress.effect, ['none', 'sparkle'], 'progress.effect')
        if (progress.headAsset !== undefined) {
            const asset = safeThemePath(String(progress.headAsset))
            if (
                !asset.startsWith('assets/') ||
                !/\.(png|jpe?g|webp)$/i.test(asset)
            )
                throw new Error('progress.headAsset is invalid')
        }
    }
    const background = value.background as Record<string, unknown> | undefined
    if (background) {
        if (background.patternAsset !== undefined) {
            const asset = safeThemePath(String(background.patternAsset))
            if (
                !asset.startsWith('assets/') ||
                !/\.(png|jpe?g|webp)$/i.test(asset)
            )
                throw new Error('background.patternAsset is invalid')
        }
        numberRange(
            background.patternOpacityLight,
            0,
            0.18,
            'patternOpacityLight'
        )
        numberRange(
            background.patternOpacityDark,
            0,
            0.18,
            'patternOpacityDark'
        )
    }
    const reader = value.reader as Record<string, unknown> | undefined
    if (reader) enumValue(reader.chrome, ['default', 'themed'], 'reader.chrome')
}

export const THEME_PACK_LIMITS = Object.freeze({
    archiveBytes: MAX_ARCHIVE_BYTES,
    entryBytes: MAX_ENTRY_BYTES,
    entries: MAX_ENTRIES,
    formatVersion: THEME_FORMAT_VERSION
})
export function validateThemePackJson(zip: AdmZip) {
    const palette = readJson(zip, 'palette.json')
    const layout = readJson(zip, 'layout.json')
    const components = readJson(zip, 'components.json')
    validatePalette(palette)
    validateLayout(layout)
    validateComponents(components)
}
export function inspectThemePack(filename: string, buffer: Buffer) {
    if (
        !Buffer.isBuffer(buffer) ||
        !buffer.length ||
        buffer.byteLength > MAX_ARCHIVE_BYTES
    )
        throw new Error('Theme pack size is invalid')
    if (!/\.(pica-theme|zip)$/i.test(filename))
        throw new Error('Theme pack must use .pica-theme or .zip')
    const zip = new AdmZip(buffer)
    const entries = zip.getEntries().filter((entry) => !entry.isDirectory)
    if (!entries.length || entries.length > MAX_ENTRIES)
        throw new Error('Theme pack file count is invalid')
    for (const entry of entries) {
        const safe = safeThemePath(entry.entryName)
        if (!allowedThemePath(safe))
            throw new Error(`Theme pack file type is not allowed: ${safe}`)
        if (entry.header.size > MAX_ENTRY_BYTES)
            throw new Error(`Theme pack resource is too large: ${safe}`)
    }
    const manifestEntry = zip.getEntry('manifest.json')
    if (!manifestEntry) throw new Error('manifest.json is missing')
    const manifest = JSON.parse(
        manifestEntry.getData().toString('utf8')
    ) as Record<string, unknown>
    if (Number(manifest.themeFormatVersion) !== THEME_FORMAT_VERSION)
        throw new Error('Unsupported themeFormatVersion')
    const id = String(manifest.id ?? '')
        .trim()
        .toLowerCase()
    if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(id))
        throw new Error('Theme id is invalid')
    validateThemePackJson(zip)
    return { id, zip, manifest }
}
export function themePackInfo(
    inspected: ReturnType<typeof inspectThemePack>,
    buffer: Buffer
): ThemePackInfo {
    const { id, manifest } = inspected
    return {
        id,
        name: String(manifest.name ?? id),
        author: String(manifest.author ?? 'Unknown'),
        version: String(manifest.version ?? '1.0.0'),
        description: String(manifest.description ?? ''),
        size: buffer.byteLength,
        sha256: sha256(buffer)
    }
}
