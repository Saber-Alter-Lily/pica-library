import {
    LEGACY_GENERIC_UPDATE_TARGET,
    isLegacyGenericUpdateTarget,
    updateTargetKey,
    type UpdateTarget
} from './target'

export interface ReleaseAssetLike {
    name?: string
    browser_download_url?: string
}

export function targetScopedUpdateAssetName(
    targetVersion: string,
    sourceVersion: string,
    target: UpdateTarget
) {
    return `Pica-Library-v${targetVersion}-${updateTargetKey(target)}-update-from-v${sourceVersion}.zip`
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
    sourceVersion: string,
    target: UpdateTarget = LEGACY_GENERIC_UPDATE_TARGET
) {
    const list = assets ?? []
    const targetScopedName = targetScopedUpdateAssetName(
        targetVersion,
        sourceVersion,
        target
    )
    const targetScoped = list.find(
        (asset) => asset.name === targetScopedName
    )
    if (targetScoped?.browser_download_url)
        return {
            kind: 'target-scoped' as const,
            name: targetScopedName,
            url: targetScoped.browser_download_url
        }

    // The historical generic update names predate target metadata and have
    // always described the Windows x64 distribution. Keep them only as a
    // compatibility path for that target; never let another OS/arch consume
    // them.
    if (!isLegacyGenericUpdateTarget(target)) return null

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
    sourceVersion: string,
    target: UpdateTarget = LEGACY_GENERIC_UPDATE_TARGET
) {
    const names = [
        targetScopedUpdateAssetName(targetVersion, sourceVersion, target)
    ]
    if (isLegacyGenericUpdateTarget(target))
        names.push(
            scopedUpdateAssetName(targetVersion, sourceVersion),
            legacyUpdateAssetName(targetVersion)
        )
    return names
}
