import fs from 'node:fs'
import path from 'node:path'
import type {
    RemoteStoragePublicConfig,
    RemoteStorageRegistry,
    RemoteStorageTarget,
    RemoteStorageVendor
} from './types'

export interface RemoteStoragePreset {
    vendor: RemoteStorageVendor
    label: string
    defaultBaseUrl?: string
    urlHint: string
    usernameHint: string
    passwordHint: string
    note: string
}

export const REMOTE_STORAGE_PRESETS: RemoteStoragePreset[] = [
    {
        vendor: 'generic',
        label: '通用 WebDAV',
        urlHint: 'https://dav.example.com/path',
        usernameHint: 'WebDAV 用户名',
        passwordHint: 'WebDAV 密码 / App Password',
        note: '适用于标准 WebDAV 服务。建议使用 HTTPS。'
    },
    {
        vendor: '123pan',
        label: '123 云盘',
        defaultBaseUrl: 'https://webdav.123pan.cn/webdav',
        urlHint: 'https://webdav.123pan.cn/webdav',
        usernameHint: '123 云盘第三方挂载用户名',
        passwordHint: '第三方挂载 App Password',
        note: '自动使用 /webdav，并启用无需 MKCOL 的扁平对象兼容模式。'
    },
    {
        vendor: 'jianguoyun',
        label: '坚果云',
        defaultBaseUrl: 'https://dav.jianguoyun.com/dav',
        urlHint: 'https://dav.jianguoyun.com/dav',
        usernameHint: '坚果云注册邮箱',
        passwordHint: '第三方应用密码',
        note: '请使用坚果云第三方应用密码，不要填写网页登录密码。'
    },
    {
        vendor: 'pcloud-us',
        label: 'pCloud · US',
        defaultBaseUrl: 'https://webdav.pcloud.com',
        urlHint: 'https://webdav.pcloud.com',
        usernameHint: 'pCloud 邮箱',
        passwordHint: 'pCloud 密码',
        note: '仅适用于 US 数据区；2FA 账号可能需要确认新登录。pCloud 不建议用 WebDAV 做大规模备份。'
    },
    {
        vendor: 'pcloud-eu',
        label: 'pCloud · EU',
        defaultBaseUrl: 'https://ewebdav.pcloud.com',
        urlHint: 'https://ewebdav.pcloud.com',
        usernameHint: 'pCloud 邮箱',
        passwordHint: 'pCloud 密码',
        note: '仅适用于 EU 数据区；不要与 US endpoint 混用。'
    },
    {
        vendor: 'koofr',
        label: 'Koofr',
        defaultBaseUrl: 'https://app.koofr.net/dav/Koofr',
        urlHint: 'https://app.koofr.net/dav/Koofr',
        usernameHint: 'Koofr 登录邮箱',
        passwordHint: 'Application password',
        note: 'Koofr WebDAV 必须使用 application-specific password。'
    },
    {
        vendor: 'yandex',
        label: 'Yandex Disk',
        defaultBaseUrl: 'https://webdav.yandex.ru',
        urlHint: 'https://webdav.yandex.ru',
        usernameHint: 'Yandex username',
        passwordHint: 'WebDAV app password',
        note: '自 2026-06-22 起 WebDAV 需要符合条件的 Yandex 360 套餐。'
    },
    {
        vendor: 'infinicloud',
        label: 'InfiniCLOUD',
        urlHint: '从 My Page 复制个人 WebDAV Connection URL',
        usernameHint: 'Connection ID',
        passwordHint: 'Apps Password',
        note: '每个账号的 WebDAV URL 可能位于不同节点，必须使用 My Page 显示的个人 URL。'
    },
    {
        vendor: 'nextcloud',
        label: 'Nextcloud',
        urlHint: 'https://server/nextcloud/remote.php/dav/files/USERNAME',
        usernameHint: 'Nextcloud 用户名',
        passwordHint: 'App password',
        note: '优先复制 Nextcloud 设置页显示的 WebDAV URL，并使用 App Password。'
    },
    {
        vendor: 'owncloud',
        label: 'ownCloud',
        urlHint: 'https://server/owncloud/remote.php/webdav',
        usernameHint: 'ownCloud 用户名',
        passwordHint: '密码 / App Password',
        note: 'URL 取决于部署版本和安装路径，请使用服务器实际提供的 WebDAV URL。'
    },
    {
        vendor: 'openlist',
        label: 'OpenList / AList',
        urlHint: 'https://server.example/dav/',
        usernameHint: 'OpenList/AList 用户名',
        passwordHint: 'OpenList/AList 密码',
        note: '写入需要启用 WebDAV 管理以及创建目录/上传等权限。可用于阿里云盘等经用户自建网关暴露的存储。'
    },
    {
        vendor: 'opendrive',
        label: 'OpenDrive',
        defaultBaseUrl: 'https://webdav.opendrive.com',
        urlHint: 'https://webdav.opendrive.com',
        usernameHint: 'OpenDrive 用户名',
        passwordHint: 'OpenDrive 密码',
        note: 'OpenDrive 官方 WebDAV 面向支持该能力的账户套餐。'
    },
    {
        vendor: 'synology',
        label: 'Synology WebDAV Server',
        urlHint: 'https://nas.example:5006',
        usernameHint: 'DSM 用户名',
        passwordHint: 'DSM 密码',
        note: '请在 DSM WebDAV Server 中启用 HTTPS；端口由 NAS 管理员配置。'
    }
]

const presetByVendor = new Map(
    REMOTE_STORAGE_PRESETS.map((preset) => [preset.vendor, preset])
)

function vendorValue(value: unknown): RemoteStorageVendor | null {
    const raw = String(value ?? '').trim() as RemoteStorageVendor
    return presetByVendor.has(raw) ? raw : null
}

export function inferWebDavVendor(value: string): RemoteStorageVendor {
    try {
        const url = new URL(value)
        const host = url.hostname.toLowerCase()
        if (host === 'webdav.123pan.cn') return '123pan'
        if (host === 'dav.jianguoyun.com') return 'jianguoyun'
        if (host === 'webdav.pcloud.com') return 'pcloud-us'
        if (host === 'ewebdav.pcloud.com') return 'pcloud-eu'
        if (host === 'app.koofr.net') return 'koofr'
        if (host === 'webdav.yandex.ru') return 'yandex'
        if (host === 'webdav.opendrive.com') return 'opendrive'
        if (host.endsWith('.teracloud.jp') || host.endsWith('.infini-cloud.net'))
            return 'infinicloud'
    } catch {
        // Validation later reports malformed URLs.
    }
    return 'generic'
}

export function normalizeWebDavBaseUrl(value: string) {
    const url = new URL(value.trim())
    if (!['http:', 'https:'].includes(url.protocol))
        throw new Error('WebDAV URL must use HTTP or HTTPS')
    url.username = ''
    url.password = ''

    const host = url.hostname.toLowerCase()
    const rootPath = url.pathname === '' || url.pathname === '/'
    if (host === 'webdav.123pan.cn' && rootPath) url.pathname = '/webdav'
    if (host === 'dav.jianguoyun.com' && rootPath) url.pathname = '/dav'
    if (host === 'app.koofr.net' && rootPath) url.pathname = '/dav/Koofr'

    return url.toString().replace(/\/$/, '')
}

export function normalizeRemoteStorageConfig(
    input: Record<string, unknown>
): RemoteStoragePublicConfig {
    const kind = String(input.kind ?? 'webdav')
    if (kind !== 'webdav') throw new Error('Only WebDAV is currently supported')
    const explicitVendor = vendorValue(input.vendor)
    const preset = explicitVendor ? presetByVendor.get(explicitVendor) : undefined
    const raw = String(input.baseUrl ?? preset?.defaultBaseUrl ?? '').trim()
    if (!raw) throw new Error('Enter the WebDAV server URL')
    const baseUrl = normalizeWebDavBaseUrl(raw)
    const vendor = explicitVendor ?? inferWebDavVendor(baseUrl)
    const root = String(input.root ?? 'PicaLibrary')
        .trim()
        .replace(/\\/g, '/')
        .replace(/^\/+|\/+$/g, '')
    if (!root) throw new Error('Enter the remote library root folder')
    return { kind: 'webdav', vendor, baseUrl, root }
}

function normalizeTarget(
    input: Record<string, unknown>,
    index: number
): RemoteStorageTarget {
    const id = String(input.id ?? `remote-${index + 1}`).trim()
    if (!/^[a-zA-Z0-9_-]{1,96}$/.test(id))
        throw new Error('Remote target id is invalid')
    const source =
        typeof input.config === 'object' && input.config
            ? (input.config as Record<string, unknown>)
            : input
    const config = normalizeRemoteStorageConfig(source)
    const fallbackLabel = presetByVendor.get(config.vendor ?? 'generic')?.label ?? 'WebDAV'
    const label = String(input.label ?? fallbackLabel).trim()
    if (!label || label.length > 80) throw new Error('Remote target label is invalid')
    return { id, label, config }
}

export function loadRemoteStorageRegistry(file: string): RemoteStorageRegistry {
    if (!fs.existsSync(file)) return { schemaVersion: 2, targets: [] }
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>
    if (Number(parsed.schemaVersion) === 2 && Array.isArray(parsed.targets)) {
        const targets = parsed.targets.map((target, index) =>
            normalizeTarget(target as Record<string, unknown>, index)
        )
        if (new Set(targets.map((target) => target.id)).size !== targets.length)
            throw new Error('Remote target ids must be unique')
        return { schemaVersion: 2, targets }
    }
    // V1 stored one public WebDAV config directly. Keep it usable without
    // rewriting user data until the next explicit save.
    const config = normalizeRemoteStorageConfig(parsed)
    const label = presetByVendor.get(config.vendor ?? 'generic')?.label ?? 'WebDAV'
    return {
        schemaVersion: 2,
        targets: [{ id: 'legacy-default', label, config }]
    }
}

export function saveRemoteStorageRegistry(
    file: string,
    value: RemoteStorageRegistry
) {
    const normalized: RemoteStorageRegistry = {
        schemaVersion: 2,
        targets: value.targets.map((target, index) =>
            normalizeTarget(
                { id: target.id, label: target.label, config: target.config },
                index
            )
        )
    }
    const serialized = JSON.stringify(normalized, null, 2)
    if (/password|authorization|cookie|token/i.test(serialized))
        throw new Error('Refusing to persist remote storage secrets in plaintext')
    fs.mkdirSync(path.dirname(file), { recursive: true })
    const temporary = `${file}.tmp`
    fs.writeFileSync(temporary, serialized, { encoding: 'utf8', mode: 0o600 })
    fs.renameSync(temporary, file)
}

// Compatibility helpers for older tests and narrow callers. New Desktop code
// should use the registry APIs above.
export function loadRemoteStorageConfig(
    file: string
): RemoteStoragePublicConfig | null {
    return loadRemoteStorageRegistry(file).targets[0]?.config ?? null
}

export function saveRemoteStorageConfig(
    file: string,
    value: RemoteStoragePublicConfig
) {
    saveRemoteStorageRegistry(file, {
        schemaVersion: 2,
        targets: [{ id: 'legacy-default', label: 'WebDAV', config: value }]
    })
}
