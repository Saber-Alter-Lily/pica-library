import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import AdmZip from 'adm-zip'

const PUBLIC_KEY_DER_B64 =
    'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEBXirGtMKpQHVTR0grXk5aRXajo0IYqiTfhkAS8FdkiQWlC7X4Tm/wgPRfFh/2QGJ/wDZva6kNUdgmO4b7WKuGg=='
const MAX_ARCHIVE_BYTES = 24 * 1024 * 1024
const MAX_ENTRY_BYTES = 8 * 1024 * 1024
const MAX_ENTRIES = 120
const THEME_FORMAT_VERSION = 1
const MAX_CREATOR_IMAGES = 4
const MAX_CREATOR_IMAGE_BYTES = 4 * 1024 * 1024
const MAX_CREATOR_IMAGES_TOTAL = 5 * 1024 * 1024
const TESTER_ENTITLEMENT =
    '{"schema":1,"supporterId":"alpha8.4-local-tester","issuedAt":"2026-09-10T05:57:19.396884Z","expiresAt":"2026-10-15T00:00:00Z","features":["theme-packs"],"nonce":"t2wYhxyJ6v5QE3dFrkCYVRij","signature":"MEYCIQD/J2wtigC7qQRc+mNzkfgFYZZU3EbdZB/Ld63iX9t/DAIhAMsz2pZcJG3mgWrs31qtn2pi1NpenSXimoZeUjFtljzA"}'

const CORE_ASSETS = [
    'mascot-main.webp',
    'mascot-head.webp',
    'recommendation-loading.webp',
    'empty-state.webp',
    'nav-library.webp',
    'nav-recommend.webp',
    'nav-online.webp',
    'nav-connect.webp',
    'pattern.webp'
] as const

const DEFAULT_MANIFEST = {
    themeFormatVersion: 1,
    id: 'replace-with-stable-theme-id',
    name: 'Theme Name',
    author: 'Theme Creator',
    version: '1.0.0',
    description: 'A concise description of this visual theme.'
}

const DEFAULT_PALETTE = {
    light: {
        primary: '#7457B9',
        primarySoft: '#E9DFFF',
        secondary: '#FFB8DA',
        accent: '#7DD3FC',
        background: '#F7F3FB',
        surface: '#FFFFFF',
        nav: '#F0EAF6',
        text: '#201E24',
        muted: '#68636E',
        outline: '#D8D2DC',
        action: '#E7E4EA',
        progressTrack: '#E9DFFF',
        progressFill: '#7457B9'
    },
    dark: {
        primary: '#D6BCFF',
        primarySoft: '#503681',
        secondary: '#FFB8DA',
        accent: '#7DD3FC',
        background: '#15121B',
        surface: '#241E2C',
        nav: '#1D1824',
        text: '#F4EFF7',
        muted: '#C7C1CC',
        outline: '#49454F',
        action: '#2B2730',
        progressTrack: '#3B3150',
        progressFill: '#D6BCFF'
    }
}

const DEFAULT_LAYOUT = {
    cardRadiusDp: 20,
    coverRadiusDp: 14,
    density: 'standard'
}

const DEFAULT_COMPONENTS = {
    typography: { title: 'comic', navigation: 'rounded' },
    navigation: { selectedEffect: 'pill', iconScale: 'standard' },
    progress: {
        style: 'mascot',
        headAsset: 'assets/mascot-head.webp',
        motion: 'bobble',
        effect: 'sparkle'
    },
    background: {
        patternAsset: 'assets/pattern.webp',
        patternOpacityLight: 0.1,
        patternOpacityDark: 0.08
    },
    reader: { chrome: 'themed' }
}

export interface SupporterGrant {
    schema: 1
    supporterId: string
    issuedAt: string
    expiresAt?: string
    features: string[]
    nonce: string
    signature: string
}

export interface ThemePackInfo {
    id: string
    name: string
    author: string
    version: string
    description: string
    size: number
    sha256: string
}

export interface ThemeCreatorReference {
    name?: unknown
    mimeType?: unknown
    dataBase64?: unknown
}

export interface ThemeCreatorInput {
    description?: unknown
    references?: unknown
}

function canonicalGrant(value: SupporterGrant) {
    return [
        '1',
        value.supporterId,
        value.issuedAt,
        value.expiresAt ?? '',
        [...new Set(value.features)].sort().join(','),
        value.nonce
    ].join('\n')
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

function sha256(value: Buffer) {
    return crypto.createHash('sha256').update(value).digest('hex')
}

function readJson(zip: AdmZip, name: string) {
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

function imageType(buffer: Buffer) {
    if (
        buffer.length >= 8 &&
        buffer
            .subarray(0, 8)
            .equals(
                Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
            )
    )
        return { extension: 'png', mimeType: 'image/png' }
    if (
        buffer.length >= 3 &&
        buffer[0] === 0xff &&
        buffer[1] === 0xd8 &&
        buffer[2] === 0xff
    )
        return { extension: 'jpg', mimeType: 'image/jpeg' }
    if (
        buffer.length >= 12 &&
        buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
        buffer.subarray(8, 12).toString('ascii') === 'WEBP'
    )
        return { extension: 'webp', mimeType: 'image/webp' }
    throw new Error('Creator reference must be PNG, JPEG, or WebP')
}

function dataUri(name: string, buffer: Buffer) {
    const lower = name.toLowerCase()
    const mime = lower.endsWith('.png')
        ? 'image/png'
        : lower.endsWith('.webp')
          ? 'image/webp'
          : 'image/jpeg'
    return `data:${mime};base64,${buffer.toString('base64')}`
}

function safeReferenceName(value: unknown, index: number, extension: string) {
    const stem = String(value ?? '')
        .replace(/\.[^.]+$/, '')
        .replace(/[^a-zA-Z0-9_-]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 48)
    return `${String(index + 1).padStart(2, '0')}-${stem || 'reference'}.${extension}`
}

export class PersonalizationService {
    readonly root: string
    readonly packsRoot: string
    readonly entitlementFile: string
    readonly activeThemeFile: string
    readonly starProofFile: string

    constructor(
        root: string,
        private readonly creatorResourcesRoot?: string
    ) {
        this.root = root
        this.packsRoot = path.join(root, 'packs')
        this.entitlementFile = path.join(root, 'supporter-entitlement-v1.json')
        this.activeThemeFile = path.join(root, 'active-theme-v1.json')
        this.starProofFile = path.join(root, 'github-star-proof-v1.json')
        fs.mkdirSync(this.packsRoot, { recursive: true })
        this.ensureBuiltinPack()
    }

    verifyGrant(value: unknown): SupporterGrant {
        if (!value || typeof value !== 'object')
            throw new Error('Supporter entitlement must be an object')
        const grant = value as SupporterGrant
        if (grant.schema !== 1)
            throw new Error('Unsupported entitlement schema')
        if (!String(grant.supporterId ?? '').trim())
            throw new Error('Supporter ID is missing')
        if (!String(grant.issuedAt ?? '').trim() || !Date.parse(grant.issuedAt))
            throw new Error('Entitlement issuedAt is invalid')
        if (Date.parse(grant.issuedAt) > Date.now() + 24 * 60 * 60 * 1000)
            throw new Error('Entitlement is not active yet')
        if (grant.expiresAt && Date.parse(grant.expiresAt) <= Date.now())
            throw new Error('Entitlement has expired')
        if (!Array.isArray(grant.features) || !grant.features.length)
            throw new Error('Entitlement has no features')
        if (
            !String(grant.nonce ?? '').trim() ||
            !String(grant.signature ?? '').trim()
        )
            throw new Error('Entitlement signature fields are missing')
        const key = crypto.createPublicKey({
            key: Buffer.from(PUBLIC_KEY_DER_B64, 'base64'),
            format: 'der',
            type: 'spki'
        })
        const ok = crypto.verify(
            'sha256',
            Buffer.from(canonicalGrant(grant), 'utf8'),
            key,
            Buffer.from(grant.signature, 'base64')
        )
        if (!ok) throw new Error('Supporter entitlement signature is invalid')
        return {
            ...grant,
            supporterId: grant.supporterId.trim(),
            features: [...new Set(grant.features.map(String))].sort()
        }
    }

    grant(): SupporterGrant | null {
        try {
            return this.verifyGrant(
                JSON.parse(fs.readFileSync(this.entitlementFile, 'utf8'))
            )
        } catch {
            return null
        }
    }

    installBundledTesterGrant() {
        if (this.grant()) return this.status()
        return this.installEntitlement(TESTER_ENTITLEMENT)
    }

    starProof() {
        try {
            const value = JSON.parse(fs.readFileSync(this.starProofFile, 'utf8')) as {
                githubUser?: unknown
                verifiedAt?: unknown
            }
            const githubUser = String(value.githubUser ?? '').trim()
            const verifiedAt = String(value.verifiedAt ?? '').trim()
            if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(githubUser)) return null
            if (!verifiedAt || !Date.parse(verifiedAt)) return null
            return { unlocked: true, githubUser, verifiedAt }
        } catch {
            return null
        }
    }

    private saveStarProof(githubUser: string) {
        fs.mkdirSync(this.root, { recursive: true })
        const proof = { unlocked: true, githubUser, verifiedAt: new Date().toISOString() }
        const temporary = `${this.starProofFile}.${process.pid}.tmp`
        fs.writeFileSync(temporary, JSON.stringify(proof, null, 2), { encoding: 'utf8', mode: 0o600 })
        fs.renameSync(temporary, this.starProofFile)
        return proof
    }

    async verifyGitHubStar(input: unknown) {
        const githubUser = String(input ?? '').trim()
        if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(githubUser))
            throw new Error('请输入有效的 GitHub 用户名')
        const response = await fetch(
            `https://api.github.com/users/${encodeURIComponent(githubUser)}/starred/Saber-Alter-Lily/pica-library`,
            {
                headers: { accept: 'application/vnd.github+json', 'user-agent': 'Pica-Library-Star-Access' },
                signal: AbortSignal.timeout(15_000)
            }
        )
        if (response.status === 204) {
            this.saveStarProof(githubUser)
            return this.status()
        }
        if (response.status === 404) throw new Error('没有检测到该账号对 Pica Library 的 Star')
        if (response.status === 403 || response.status === 429)
            throw new Error('GitHub 暂时限制了验证请求，请稍后重试')
        throw new Error(`GitHub Star 验证失败（HTTP ${response.status}）`)
    }

    private hasThemeAccess() {
        return Boolean(this.starProof())
    }

    activeThemeId() {
        if (!this.hasThemeAccess()) return null
        try {
            const value = JSON.parse(
                fs.readFileSync(this.activeThemeFile, 'utf8')
            ) as {
                id?: unknown
            }
            const id = String(value.id ?? '')
                .trim()
                .toLowerCase()
            return /^[a-z0-9][a-z0-9._-]{0,63}$/.test(id) &&
                fs.existsSync(path.join(this.packsRoot, `${id}.pica-theme`))
                ? id
                : null
        } catch {
            return null
        }
    }

    status() {
        const proof = this.starProof()
        const unlocked = Boolean(proof)
        return {
            supporter: unlocked,
            features: unlocked ? ['theme-packs'] : [],
            supporterId: proof ? `github:${proof.githubUser}` : null,
            starUnlocked: unlocked,
            starUser: proof?.githubUser ?? null,
            starVerifiedAt: proof?.verifiedAt ?? null,
            activeThemeId: unlocked ? this.activeThemeId() : null
        }
    }

    installEntitlement(input: Buffer | string) {
        const text = Buffer.isBuffer(input) ? input.toString('utf8') : input
        const grant = this.verifyGrant(JSON.parse(text))
        fs.mkdirSync(this.root, { recursive: true })
        const temporary = `${this.entitlementFile}.${process.pid}.tmp`
        fs.writeFileSync(temporary, JSON.stringify(grant, null, 2), {
            encoding: 'utf8',
            mode: 0o600
        })
        fs.renameSync(temporary, this.entitlementFile)
        return this.status()
    }

    entitlementText() {
        const grant = this.grant()
        return grant ? JSON.stringify(grant) : null
    }

    private requireThemeAccess() {
        const proof = this.starProof()
        if (!proof) throw new Error('给 Pica Library 项目 Star 后即可解锁个性化装扮')
        return proof
    }

    importThemePack(filename: string, buffer: Buffer): ThemePackInfo {
        this.requireThemeAccess()
        return this.writeValidatedPack(filename, buffer)
    }

    private validatePackJson(zip: AdmZip) {
        const palette = readJson(zip, 'palette.json')
        const layout = readJson(zip, 'layout.json')
        const components = readJson(zip, 'components.json')
        validatePalette(palette)
        validateLayout(layout)
        validateComponents(components)
    }

    private writeValidatedPack(
        filename: string,
        buffer: Buffer
    ): ThemePackInfo {
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
        this.validatePackJson(zip)
        const destination = path.join(this.packsRoot, `${id}.pica-theme`)
        const temporary = `${destination}.${process.pid}.tmp`
        fs.writeFileSync(temporary, buffer, { mode: 0o600 })
        fs.renameSync(temporary, destination)
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

    listThemePacks(): ThemePackInfo[] {
        if (!this.hasThemeAccess()) return []
        const files = fs.existsSync(this.packsRoot)
            ? fs
                  .readdirSync(this.packsRoot)
                  .filter((name) => name.endsWith('.pica-theme'))
            : []
        const result: ThemePackInfo[] = []
        for (const name of files) {
            try {
                const buffer = fs.readFileSync(path.join(this.packsRoot, name))
                const zip = new AdmZip(buffer)
                const manifest = JSON.parse(
                    zip.getEntry('manifest.json')!.getData().toString('utf8')
                ) as Record<string, unknown>
                this.validatePackJson(zip)
                result.push({
                    id: String(manifest.id),
                    name: String(manifest.name ?? manifest.id),
                    author: String(manifest.author ?? 'Unknown'),
                    version: String(manifest.version ?? '1.0.0'),
                    description: String(manifest.description ?? ''),
                    size: buffer.byteLength,
                    sha256: sha256(buffer)
                })
            } catch {
                // Invalid files are ignored rather than exposed to clients.
            }
        }
        return result.sort((a, b) => a.name.localeCompare(b.name))
    }

    themePack(id: string) {
        this.requireThemeAccess()
        if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(id))
            throw new Error('Theme id is invalid')
        const file = path.join(this.packsRoot, `${id}.pica-theme`)
        if (!fs.existsSync(file)) throw new Error('Theme pack was not found')
        return fs.readFileSync(file)
    }

    activateThemePack(idInput: string) {
        this.requireThemeAccess()
        const id = String(idInput ?? '')
            .trim()
            .toLowerCase()
        if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(id))
            throw new Error('Theme id is invalid')
        this.themePack(id)
        fs.mkdirSync(this.root, { recursive: true })
        const temporary = `${this.activeThemeFile}.${process.pid}.tmp`
        fs.writeFileSync(temporary, JSON.stringify({ id }, null, 2), {
            encoding: 'utf8',
            mode: 0o600
        })
        fs.renameSync(temporary, this.activeThemeFile)
        return { ...this.status(), activeThemeId: id }
    }

    deactivateThemePack() {
        this.requireThemeAccess()
        try {
            fs.unlinkSync(this.activeThemeFile)
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
        }
        return { ...this.status(), activeThemeId: null }
    }

    themeDescriptor(idInput?: string) {
        this.requireThemeAccess()
        const id = String(idInput || this.activeThemeId() || '')
            .trim()
            .toLowerCase()
        if (!id) return null
        const buffer = this.themePack(id)
        const zip = new AdmZip(buffer)
        const manifest = readJson(zip, 'manifest.json')
        const assets: Record<string, string> = {}
        for (const name of CORE_ASSETS) {
            const entry = zip.getEntry(`assets/${name}`)
            if (entry && !entry.isDirectory)
                assets[name] = dataUri(name, entry.getData())
        }
        return {
            id,
            name: String(manifest.name ?? id),
            author: String(manifest.author ?? 'Unknown'),
            version: String(manifest.version ?? '1.0.0'),
            description: String(manifest.description ?? ''),
            palette: readJson(zip, 'palette.json'),
            layout: readJson(zip, 'layout.json'),
            components: readJson(zip, 'components.json'),
            assets
        }
    }

    private creatorResource(name: string) {
        if (!this.creatorResourcesRoot)
            throw new Error('Theme Creator resources are unavailable')
        const file = path.join(this.creatorResourcesRoot, name)
        if (!fs.existsSync(file))
            throw new Error(`Theme Creator resource is missing: ${name}`)
        return fs.readFileSync(file)
    }

    createThemeCreatorKit(input: ThemeCreatorInput) {
        this.requireThemeAccess()
        const description = String(input.description ?? '').trim()
        if (description.length < 3 || description.length > 4000)
            throw new Error('Theme description must contain 3–4000 characters')
        const references = Array.isArray(input.references)
            ? (input.references as ThemeCreatorReference[])
            : []
        if (references.length > MAX_CREATOR_IMAGES)
            throw new Error(
                `At most ${MAX_CREATOR_IMAGES} reference images are allowed`
            )

        const zip = new AdmZip()
        zip.addFile(
            '00_READ_ME_FIRST.md',
            Buffer.from(
                '# Pica Library Theme Creator Kit\n\n' +
                    'Give this ZIP directly to a capable AI. The AI must read the files in numeric order, inspect every image in `reference-images/`, create the requested visual assets, validate them against the included specification, and return one finished `.pica-theme` archive.\n\n' +
                    'Do not ask the user to manually rebuild the JSON or image set when the AI has file-generation capability.\n',
                'utf8'
            )
        )
        zip.addFile(
            '01_THEME_REQUEST.txt',
            Buffer.from(`${description}\n`, 'utf8')
        )
        zip.addFile(
            '02_FIXED_AI_PROMPT.md',
            this.creatorResource('theme-pack-creator-prompt.txt')
        )
        zip.addFile(
            '03_THEME_PACK_SPEC_V1.md',
            this.creatorResource('theme-pack-spec-v1.txt')
        )
        zip.addFile(
            'template/manifest.json',
            Buffer.from(JSON.stringify(DEFAULT_MANIFEST, null, 2), 'utf8')
        )
        zip.addFile(
            'template/palette.json',
            Buffer.from(JSON.stringify(DEFAULT_PALETTE, null, 2), 'utf8')
        )
        zip.addFile(
            'template/layout.json',
            Buffer.from(JSON.stringify(DEFAULT_LAYOUT, null, 2), 'utf8')
        )
        zip.addFile(
            'template/components.json',
            Buffer.from(JSON.stringify(DEFAULT_COMPONENTS, null, 2), 'utf8')
        )
        zip.addFile(
            'template/ASSETS_REQUIRED.txt',
            Buffer.from(
                CORE_ASSETS.map((name) => `assets/${name}`).join('\n') + '\n',
                'utf8'
            )
        )

        let total = 0
        const metadata: Array<{
            name: string
            mimeType: string
            bytes: number
        }> = []
        references.forEach((reference, index) => {
            const encoded = String(reference.dataBase64 ?? '')
            if (!encoded) throw new Error('Reference image data is missing')
            const buffer = Buffer.from(encoded, 'base64')
            if (!buffer.length || buffer.byteLength > MAX_CREATOR_IMAGE_BYTES)
                throw new Error('A creator reference image is too large')
            total += buffer.byteLength
            if (total > MAX_CREATOR_IMAGES_TOTAL)
                throw new Error(
                    'Creator reference images are too large in total'
                )
            const detected = imageType(buffer)
            const name = safeReferenceName(
                reference.name,
                index,
                detected.extension
            )
            zip.addFile(`reference-images/${name}`, buffer)
            metadata.push({
                name,
                mimeType: detected.mimeType,
                bytes: buffer.byteLength
            })
        })
        zip.addFile(
            'REFERENCE_IMAGES.json',
            Buffer.from(JSON.stringify(metadata, null, 2), 'utf8')
        )
        const output = zip.toBuffer()
        return {
            fileName: 'Pica-Library-Theme-Creator-Kit.zip',
            buffer: output,
            size: output.byteLength,
            references: metadata.length
        }
    }

    private ensureBuiltinPack() {
        const legacy = path.join(this.packsRoot, 'pica-violet.pica-theme')
        const file = path.join(this.packsRoot, 'pica-violet-star.pica-theme')
        if (fs.existsSync(file)) return
        if (this.creatorResourcesRoot) {
            const bundled = path.join(this.creatorResourcesRoot, 'pica-violet-default.pica-theme')
            if (fs.existsSync(bundled)) {
                fs.copyFileSync(bundled, file)
                try { fs.unlinkSync(legacy) } catch {}
                return
            }
        }
        const zip = new AdmZip()
        zip.addFile('manifest.json', Buffer.from(JSON.stringify({ themeFormatVersion: 1, id: 'pica-violet-star', name: 'Pica Violet · 星漫', author: 'Pica Library', version: '1.0.0', description: '官方 Star 首发装扮。' }, null, 2)))
        zip.addFile('palette.json', Buffer.from(JSON.stringify(DEFAULT_PALETTE, null, 2)))
        zip.addFile('layout.json', Buffer.from(JSON.stringify(DEFAULT_LAYOUT, null, 2)))
        zip.addFile('components.json', Buffer.from(JSON.stringify(DEFAULT_COMPONENTS, null, 2)))
        fs.writeFileSync(file, zip.toBuffer(), { mode: 0o600 })
        try { fs.unlinkSync(legacy) } catch {}
    }

}
