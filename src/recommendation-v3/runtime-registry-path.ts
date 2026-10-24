import fs from 'node:fs'
import path from 'node:path'
import { TAG_RUNTIME_MANIFEST, TAG_RUNTIME_SOURCE, TAG_RUNTIME_PACKAGED } from '../tag-assets/runtime-format'

const manifest = TAG_RUNTIME_MANIFEST
export const sourceRegistryDirectory = TAG_RUNTIME_SOURCE
export const packagedRegistryDirectory = TAG_RUNTIME_PACKAGED

export function runtimeRegistryDirectory(
    primary = sourceRegistryDirectory,
    packaged = packagedRegistryDirectory
) {
    if (fs.existsSync(path.join(primary, manifest))) return primary
    if (fs.existsSync(path.join(packaged, manifest))) return packaged
    // Do not fall back to old installed review-evidence directories. Missing or
    // corrupt minimal assets fail rather than silently selecting stale rules.
    return primary
}
