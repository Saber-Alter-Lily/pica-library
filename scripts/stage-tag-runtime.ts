import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { loadTagRegistryV3 } from '../src/tag-assets/registry-v3'
import { TAG_RUNTIME_SOURCE, TAG_RUNTIME_PACKAGED, TAG_RUNTIME_FILES, TAG_RUNTIME_MANIFEST } from '../src/tag-assets/runtime-format'

/** Exact runtime allowlist shared by every package; no evidence-directory glob. */
export function stageTagRuntime(stage: string, source = TAG_RUNTIME_SOURCE) {
    const sourceRegistry = loadTagRegistryV3(source)
    if (!sourceRegistry.runtimeManifestSha256) throw new Error('Only the minimal versioned runtime may be staged')
    const application = path.resolve(stage)
    if (!fs.statSync(application).isDirectory()) throw new Error('Fresh application stage is required')
    for (const marker of ['app/desktop.js', 'app/module-contracts.json'])
        if (!fs.existsSync(path.join(application, marker)) || !fs.lstatSync(path.join(application, marker)).isFile())
            throw new Error('A built application engine root is required before staging tag assets')
    for (const legacy of ['src/data/registry-v3-final', 'app/runtime-assets/registry-v3-final'])
        if (fs.existsSync(path.join(application, legacy))) throw new Error('Legacy review evidence must not be merged into a new application package')
    const target = path.join(application, TAG_RUNTIME_PACKAGED)
    if (fs.existsSync(target)) throw new Error('Refuse to overwrite an existing runtime stage')
    fs.mkdirSync(target, { recursive: true })
    for (const name of [...TAG_RUNTIME_FILES, TAG_RUNTIME_MANIFEST])
        fs.copyFileSync(path.join(source, name), path.join(target, name), fs.constants.COPYFILE_EXCL)
    const loaded = loadTagRegistryV3(target)
    if (loaded.manifestSha256 !== sourceRegistry.manifestSha256 || loaded.runtimeManifestSha256 !== sourceRegistry.runtimeManifestSha256)
        throw new Error('Staged tag runtime differs')
    return { files: TAG_RUNTIME_FILES.length + 1, relativePath: TAG_RUNTIME_PACKAGED, semanticAuthoritySha256: loaded.manifestSha256, runtimeManifestSha256: loaded.runtimeManifestSha256, reviewedEvidenceStaged: false }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
    const [stage, ...extra] = process.argv.slice(2)
    if (!stage || extra.length) throw new Error('Usage: tsx scripts/stage-tag-runtime.ts <fresh-package-stage>')
    console.log(JSON.stringify(stageTagRuntime(stage)))
}
