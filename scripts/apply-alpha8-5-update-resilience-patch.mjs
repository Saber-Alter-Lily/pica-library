import fs from 'node:fs'

const file = 'src/update/manager.ts'
let source = fs.readFileSync(file, 'utf8')

function replaceMethod(startMarker, endMarker, replacement) {
    if (source.includes(replacement)) return
    const start = source.indexOf(startMarker)
    if (start < 0)
        throw new Error(
            `Update resilience start marker missing: ${startMarker}`
        )
    const end = source.indexOf(endMarker, start + startMarker.length)
    if (end < 0)
        throw new Error(`Update resilience end marker missing: ${endMarker}`)
    source = source.slice(0, start) + replacement + '\n\n' + source.slice(end)
}

const verifyMethod = `    private async verifyOfficialRelease(
        manifest: UpdateManifest,
        archiveName: string,
        archiveHash: string
    ) {
        const request = this.options.fetchImplementation ?? fetch
        const tag = \`v\${manifest.targetVersion}\`
        try {
            const response = await request(
                \`https://api.github.com/repos/\${officialRepository}/releases/tags/\${encodeURIComponent(tag)}\`,
                {
                    headers: {
                        accept: 'application/vnd.github+json',
                        'user-agent': 'Pica-Library-UpdateManager'
                    },
                    signal: AbortSignal.timeout(12_000)
                }
            )
            if (response.ok) {
                const release = (await response.json()) as {
                    tag_name?: string
                    draft?: boolean
                    prerelease?: boolean
                    assets?: Array<{
                        name?: string
                        digest?: string | null
                        browser_download_url?: string
                    }>
                }
                if (release.tag_name !== tag)
                    throw new Error('Official release tag mismatch')
                if (release.draft || release.prerelease)
                    throw new Error('Official release must be a published stable release')
                const asset = release.assets?.find((item) => item.name === archiveName)
                if (!asset) throw new Error('Update asset is not in the official release')
                if (asset.digest === \`sha256:\${archiveHash}\`) return
                const sums = release.assets?.find((item) => item.name === 'SHA256SUMS.txt')
                if (sums?.browser_download_url) {
                    const sumsResponse = await request(sums.browser_download_url, {
                        signal: AbortSignal.timeout(12_000)
                    })
                    if (sumsResponse.ok) {
                        const expected = this.shaFromSums(await sumsResponse.text(), archiveName)
                        if (expected === archiveHash) return
                    }
                }
            }
        } catch {
            // Fall through to the GitHub-hosted checksum path below.
        }

        const sumsUrl = \`https://github.com/\${officialRepository}/releases/download/\${encodeURIComponent(tag)}/SHA256SUMS.txt\`
        const sumsResponse = await request(sumsUrl, {
            headers: { 'user-agent': 'Pica-Library-UpdateManager' },
            signal: AbortSignal.timeout(12_000)
        })
        if (!sumsResponse.ok)
            throw new Error('Official release checksum is unavailable')
        const expected = this.shaFromSums(await sumsResponse.text(), archiveName)
        if (expected !== archiveHash)
            throw new Error('Update archive does not match the official SHA-256')
    }

    private shaFromSums(text: string, archiveName: string) {
        return text
            .split(/\\r?\\n/)
            .map((line) => line.trim().split(/\\s+/, 2))
            .find((parts) => parts[1]?.replace(/^\\*/, '') === archiveName)?.[0]
    }

    private availableFromRelease(version: string, releaseUrl: string, assetName?: string, assetUrl?: string) {
        if (!stableVersionParts(version) || !isNewerStable(version, this.options.currentVersion))
            return {
                status: 'current' as const,
                currentVersion: this.options.currentVersion
            }
        if (!assetName || !assetUrl)
            return { status: 'full-install' as const, version, releaseUrl }
        return {
            status: 'incremental' as const,
            version,
            releaseUrl,
            assetName,
            assetUrl
        }
    }`

replaceMethod(
    '    private async verifyOfficialRelease(',
    '    async checkForUpdate()',
    verifyMethod
)

const checkMethod = `    async checkForUpdate() {
        const request = this.options.fetchImplementation ?? fetch
        try {
            const response = await request(
                \`https://api.github.com/repos/\${officialRepository}/releases/latest\`,
                {
                    headers: {
                        accept: 'application/vnd.github+json',
                        'user-agent': 'Pica-Library-UpdateManager'
                    },
                    signal: AbortSignal.timeout(12_000)
                }
            )
            if (response.ok) {
                const release = (await response.json()) as {
                    tag_name?: string
                    html_url?: string
                    draft?: boolean
                    prerelease?: boolean
                    assets?: Array<{
                        name?: string
                        browser_download_url?: string
                    }>
                }
                const tag = String(release.tag_name ?? '')
                const version = tag.startsWith('v') ? tag.slice(1) : ''
                if (!release.draft && !release.prerelease) {
                    const releaseUrl = release.html_url ??
                        \`https://github.com/\${officialRepository}/releases/tag/\${encodeURIComponent(tag)}\`
                    const updateAsset = release.assets?.find((item) =>
                        /^Pica-Library-v\\d+\\.\\d+\\.\\d+-update\\.zip$/.test(String(item.name ?? ''))
                    )
                    return this.availableFromRelease(
                        version,
                        releaseUrl,
                        updateAsset?.name,
                        updateAsset?.browser_download_url
                    )
                }
            }
        } catch {
            // GitHub REST may be rate-limited or blocked while release assets remain reachable.
        }

        try {
            const sumsResponse = await request(
                \`https://github.com/\${officialRepository}/releases/latest/download/SHA256SUMS.txt\`,
                {
                    headers: { 'user-agent': 'Pica-Library-UpdateManager' },
                    signal: AbortSignal.timeout(12_000)
                }
            )
            if (!sumsResponse.ok) throw new Error('checksum fallback unavailable')
            const finalUrl = sumsResponse.url || ''
            const match = finalUrl.match(/\\/releases\\/download\\/v(\\d+\\.\\d+\\.\\d+)\\/SHA256SUMS\\.txt(?:\\?|$)/)
            if (!match) throw new Error('could not resolve latest version from checksum redirect')
            const version = match[1]
            const assetName = \`Pica-Library-v\${version}-update.zip\`
            const checksum = this.shaFromSums(await sumsResponse.text(), assetName)
            const releaseUrl = \`https://github.com/\${officialRepository}/releases/tag/v\${version}\`
            return this.availableFromRelease(
                version,
                releaseUrl,
                checksum ? assetName : undefined,
                checksum
                    ? \`https://github.com/\${officialRepository}/releases/download/v\${version}/\${assetName}\`
                    : undefined
            )
        } catch {
            throw new Error(
                '无法读取官方更新通道。GitHub API 与 Release 下载通道均不可用，请检查网络或代理后重试。'
            )
        }
    }`

replaceMethod('    async checkForUpdate()', '    async stage(', checkMethod)

const stageStart = source.indexOf(
    '    async stage(archiveName: string, buffer: Buffer) {'
)
const applyStart = source.indexOf('\n    apply(id: string) {', stageStart)
if (stageStart < 0 || applyStart < 0)
    throw new Error('Update resilience stage markers are missing')
let stageBlock = source.slice(stageStart, applyStart)
if (
    !stageBlock.includes(
        '        try {\n            const archiveHash = sha256(buffer)'
    )
) {
    stageBlock = stageBlock.replace(
        "        this.writeProgress({ phase: 'validating' })\n        const archiveHash = sha256(buffer)",
        "        this.writeProgress({ phase: 'validating' })\n        try {\n            const archiveHash = sha256(buffer)"
    )
    const closing = stageBlock.lastIndexOf('\n    }')
    if (closing < 0) throw new Error('Could not close stage resilience wrapper')
    stageBlock =
        stageBlock.slice(0, closing) +
        `\n        } catch (error) {\n            const message = error instanceof Error ? error.message : String(error)\n            this.writeProgress({ phase: 'failed', message })\n            throw error\n        }` +
        stageBlock.slice(closing)
    source = source.slice(0, stageStart) + stageBlock + source.slice(applyStart)
}

fs.writeFileSync(file, source, 'utf8')
console.log('Alpha8.5 updater resilience patch applied')
