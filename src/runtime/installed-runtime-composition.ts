import fs from 'node:fs'
import path from 'node:path'
import { compositionFromPayload, RUNTIME_COMPOSITION_PATH, type RuntimeComposition } from '../modules/runtime-composition'

export type InstalledRuntimeComposition =
    | { status: 'declared' | 'legacy'; composition: RuntimeComposition }
    | { status: 'invalid'; composition: null }

/** Read application-owned packaging facts only; no profile, credential, process or network access. */
export function installedRuntimeComposition(applicationRoot: string): InstalledRuntimeComposition {
    try {
        const root = path.resolve(applicationRoot)
        if (!fs.statSync(root).isDirectory()) throw Error('Application root is not a directory')
        const optionalStat = (file: string) => {
            try { return fs.lstatSync(file) }
            catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error }
        }
        const names: string[] = []
        let descriptor: string | undefined
        for (const relative of ['app', 'runtime', 'runtime/jm/bin', 'runtime/jm/lib']) {
            const folder = path.join(root, relative)
            const stat = optionalStat(folder)
            if (!stat) continue
            if (!stat.isDirectory() || stat.isSymbolicLink()) throw Error('Linked application path')
        }
        const manifest = path.join(root, RUNTIME_COMPOSITION_PATH)
        const manifestStat = optionalStat(manifest)
        if (manifestStat) {
            const stat = manifestStat
            if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 4096) throw Error('Invalid descriptor')
            descriptor = fs.readFileSync(manifest, 'utf8')
            names.push(RUNTIME_COMPOSITION_PATH)
        }
        const runtime = path.join(root, 'runtime/jm')
        const runtimeStat = optionalStat(runtime)
        if (runtimeStat) {
            const stat = runtimeStat
            if (!stat.isDirectory() || stat.isSymbolicLink()) throw Error('Invalid runtime')
            // Presence must not be mistaken for permission, nor a partial install for a core package.
            names.push('runtime/jm/.presence')
            for (const relative of ['bin/java.exe', 'bin/java', 'lib/pica-jm-source.jar', 'PICA_JM_RUNTIME.json']) {
                const file = path.join(runtime, relative)
                const stat = optionalStat(file)
                if (!stat) continue
                if (!stat.isFile() || stat.isSymbolicLink()) throw Error('Invalid runtime file')
                names.push('runtime/jm/' + relative)
            }
        }
        return { status: descriptor === undefined ? 'legacy' : 'declared', composition: compositionFromPayload(names, descriptor) }
    } catch { return { status: 'invalid', composition: null } }
}

export function requireInstalledRuntimeComposition(applicationRoot: string) {
    const value = installedRuntimeComposition(applicationRoot)
    if (value.status === 'invalid') throw Error('Installed runtime composition is invalid; preserve the application and use a verified complete package')
    return value.composition
}
