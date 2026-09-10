import fs from 'node:fs'
import path from 'node:path'

const manifest = 'PICA_REGISTRY_V3_FINAL_MANIFEST.json'
export const sourceRegistryDirectory = 'src/data/registry-v3-final'
export const packagedRegistryDirectory = 'app/runtime-assets/registry-v3-final'

export function runtimeRegistryDirectory(
    primary = sourceRegistryDirectory,
    packaged = packagedRegistryDirectory
) {
    if (fs.existsSync(path.join(primary, manifest))) return primary
    if (fs.existsSync(path.join(packaged, manifest))) return packaged
    // Preserve the original authority path in any diagnostic error when both
    // immutable locations are unavailable.
    return primary
}
