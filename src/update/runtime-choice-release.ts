import type { RuntimeComposition } from '../modules/runtime-composition'
import { fullApplicationAssetName } from './release-assets'
import { createUpdateAbortScope } from './abort-scope'

const repository = 'Saber-Alter-Lily/pica-library'
const headers = {
    accept: 'application/vnd.github+json',
    'user-agent': 'Pica-Library-UpdateManager'
}
export interface RuntimeChoiceRelease {
    version: string
    archiveName: string
    url: string
    sha256: string
    bytes: number | null
}
/** Explicit user command only; no provider/credentials/FS/process dependency or asset-name fallback. */
export async function discoverRuntimeChoiceRelease(
    composition: RuntimeComposition,
    request: typeof fetch,
    signal?: AbortSignal
): Promise<RuntimeChoiceRelease> {
    const scopes: Array<ReturnType<typeof createUpdateAbortScope>> = []
    const fetch = (url: string) => {
        const scope = createUpdateAbortScope([
            signal,
            AbortSignal.timeout(12000)
        ])
        scopes.push(scope)
        return request(url, { headers, signal: scope.signal })
    }
    const digest = (text: string, name: string) => {
        const row = text
            .split(/\r?\n/)
            .map((line) => line.trim().split(/\s+/, 2))
            .find((parts) => parts[1]?.replace(/^\*/, '') === name)
        if (!row || !/^[a-f0-9]{64}$/.test(row[0]))
            throw Error(
                'The selected runtime package has no valid official checksum'
            )
        return row[0]
    }
    const identity = (version: string) => {
        if (!/^\d+\.\d+\.\d+$/.test(version))
            throw Error('A published stable runtime package is required')
        const archiveName = fullApplicationAssetName(
            version,
            { platform: 'windows', arch: 'x64' },
            composition
        )
        return {
            version,
            archiveName,
            url: `https://github.com/${repository}/releases/download/v${version}/${archiveName}`
        }
    }
    try {
        try {
            const response = await fetch(
                `https://api.github.com/repos/${repository}/releases/latest`
            )
            if (!response.ok) throw Error('Release API unavailable')
            const release = (await response.json()) as {
                tag_name?: string
                draft?: boolean
                prerelease?: boolean
                assets?: Array<{
                    name?: string
                    browser_download_url?: string
                    digest?: string
                    size?: number
                }>
            }
            if (
                release.draft ||
                release.prerelease ||
                !release.tag_name?.startsWith('v')
            )
                throw Error('Published stable release required')
            const selected = identity(release.tag_name.slice(1)),
                asset = release.assets?.find(
                    (asset) => asset.name === selected.archiveName
                )
            if (!asset || asset.browser_download_url !== selected.url)
                throw Error(
                    'The selected complete runtime package is not published'
                )
            let sha256 = asset.digest?.match(/^sha256:([a-f0-9]{64})$/)?.[1]
            if (!sha256) {
                const sums = await fetch(
                    `https://github.com/${repository}/releases/download/v${selected.version}/SHA256SUMS.txt`
                )
                if (!sums.ok) throw Error('Official checksums unavailable')
                sha256 = digest(await sums.text(), selected.archiveName)
            }
            return {
                ...selected,
                sha256,
                bytes:
                    Number.isSafeInteger(asset.size) && asset.size! > 0
                        ? asset.size!
                        : null
            }
        } catch (error) {
            if (signal?.aborted) throw error
            const response = await fetch(
                `https://github.com/${repository}/releases/latest/download/SHA256SUMS.txt`
            )
            if (!response.ok)
                throw Error(
                    'The selected optional runtime package is unavailable through the official channels'
                )
            const url = new URL(response.url)
            const match = url.pathname.match(
                /^\/Saber-Alter-Lily\/pica-library\/releases\/download\/v(\d+\.\d+\.\d+)\/SHA256SUMS\.txt$/
            )
            if (
                url.origin !== 'https://github.com' ||
                url.username ||
                url.password ||
                url.hash ||
                !match
            )
                throw Error('Invalid official checksum redirect')
            const selected = identity(match[1])
            return {
                ...selected,
                sha256: digest(await response.text(), selected.archiveName),
                bytes: null
            }
        }
    } finally {
        for (const scope of scopes) scope.dispose()
    }
}
