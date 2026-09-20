export interface ReleaseAssetLike {
    name?: string
    browser_download_url?: string
}

export function scopedUpdateAssetName(
    targetVersion: string,
    sourceVersion: string
) {
    return `Pica-Library-v${targetVersion}-update-from-v${sourceVersion}.zip`
}

export function legacyUpdateAssetName(targetVersion: string) {
    return `Pica-Library-v${targetVersion}-update.zip`
}

export function selectReleaseUpdateAsset(
    assets: ReleaseAssetLike[] | undefined,
    targetVersion: string,
    sourceVersion: string
) {
    const list = assets ?? []
    const scopedName = scopedUpdateAssetName(targetVersion, sourceVersion)
    const scoped = list.find((asset) => asset.name === scopedName)
    if (scoped?.browser_download_url)
        return {
            kind: 'scoped' as const,
            name: scopedName,
            url: scoped.browser_download_url
        }

    const legacyName = legacyUpdateAssetName(targetVersion)
    const legacy = list.find((asset) => asset.name === legacyName)
    if (legacy?.browser_download_url)
        return {
            kind: 'legacy' as const,
            name: legacyName,
            url: legacy.browser_download_url
        }

    return null
}

export function updateAssetNamesForChecksums(
    targetVersion: string,
    sourceVersion: string
) {
    return [
        scopedUpdateAssetName(targetVersion, sourceVersion),
        legacyUpdateAssetName(targetVersion)
    ]
}
