export type UpdatePlatform = 'windows' | 'macos' | 'linux'
export type UpdateArch = 'x64' | 'arm64'

export interface UpdateTarget {
    platform: UpdatePlatform
    arch: UpdateArch
}

export const LEGACY_GENERIC_UPDATE_TARGET: UpdateTarget = Object.freeze({
    platform: 'windows',
    arch: 'x64'
})

export function updateTargetFromRuntime(
    platform: NodeJS.Platform = process.platform,
    arch: string = process.arch
): UpdateTarget | null {
    const normalizedPlatform: UpdatePlatform | null =
        platform === 'win32'
            ? 'windows'
            : platform === 'darwin'
              ? 'macos'
              : platform === 'linux'
                ? 'linux'
                : null
    const normalizedArch: UpdateArch | null =
        arch === 'x64' ? 'x64' : arch === 'arm64' ? 'arm64' : null
    if (!normalizedPlatform || !normalizedArch) return null
    return { platform: normalizedPlatform, arch: normalizedArch }
}

export function normalizeUpdateTarget(
    platform: unknown,
    arch: unknown
): UpdateTarget | null {
    const normalizedPlatform =
        platform === 'windows' || platform === 'macos' || platform === 'linux'
            ? platform
            : null
    const normalizedArch =
        arch === 'x64' || arch === 'arm64' ? arch : null
    if (!normalizedPlatform || !normalizedArch) return null
    return {
        platform: normalizedPlatform,
        arch: normalizedArch
    }
}

export function updateTargetKey(target: UpdateTarget) {
    return `${target.platform}-${target.arch}`
}

export function sameUpdateTarget(left: UpdateTarget, right: UpdateTarget) {
    return left.platform === right.platform && left.arch === right.arch
}

export function isLegacyGenericUpdateTarget(target: UpdateTarget) {
    return sameUpdateTarget(target, LEGACY_GENERIC_UPDATE_TARGET)
}
