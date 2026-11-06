import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { compositionFromPayload, normalizeRuntimeComposition, RUNTIME_COMPOSITION_PATH, type RuntimeComposition } from '../src/modules/runtime-composition'

/** Existing trusted build output only. This never starts Java or installs downloaded code. */
export function stageSourceRuntime(applicationRoot: string, checkoutRoot: string, input: RuntimeComposition) {
    const composition = normalizeRuntimeComposition(input)
    const stage = path.resolve(applicationRoot), source = path.resolve(checkoutRoot, 'runtime/jm')
    if (!fs.lstatSync(stage).isDirectory() || fs.lstatSync(stage).isSymbolicLink()) throw Error('Fresh non-linked application stage required')
    const app = path.join(stage, 'app'), runtime = path.join(stage, 'runtime')
    for (const folder of [app, runtime])
        if (!fs.lstatSync(folder).isDirectory() || fs.lstatSync(folder).isSymbolicLink()) throw Error('Built application stage required')
    for (const marker of ['desktop.js', 'module-contracts.json']) {
        const stat = fs.lstatSync(path.join(app, marker))
        if (!stat.isFile() || stat.isSymbolicLink()) throw Error('Built non-linked application engine required')
    }
    const descriptor = path.join(stage, RUNTIME_COMPOSITION_PATH), target = path.join(runtime, 'jm')
    if (fs.existsSync(descriptor) || fs.existsSync(target)) throw Error('Refuse to overwrite an existing runtime stage')
    const names: string[] = [RUNTIME_COMPOSITION_PATH]
    if (composition.sourceRuntimes.includes('jm')) {
        const sourceReal = fs.realpathSync.native(source)
        if (fs.lstatSync(source).isSymbolicLink()) throw Error('Linked runtime input is forbidden')
        const walk = (directory: string): string[] => fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
            const file = path.join(directory, entry.name), stat = fs.lstatSync(file)
            if (stat.isSymbolicLink() || !fs.realpathSync.native(file).startsWith(sourceReal + path.sep)) throw Error('Runtime input escaped its root')
            if (stat.isDirectory()) return walk(file)
            if (!stat.isFile()) throw Error('Runtime input must be regular files')
            return [file]
        })
        const files = walk(source)
        if (files.length > 5000 || files.reduce((size, file) => size + fs.statSync(file).size, 0) > 256 * 1024 * 1024)
            throw Error('JM runtime exceeds build limits')
        if (files.some(file => /(?:^|[\\/])(?:credentials\.dat|remote-storage\.json|library\.db(?:-wal|-shm)?|\.env)$|\.(?:cbz|cbr|epub)$/i.test(file)))
            throw Error('Profile data or comic archives are forbidden in source runtimes')
        const manifestFile = path.join(source, 'PICA_JM_RUNTIME.json')
        if (fs.statSync(manifestFile).size > 8192) throw Error('JM runtime manifest too large')
        const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8').replace(/^\uFEFF/, ''))
        const jarHash = createHash('sha256').update(fs.readFileSync(path.join(source, 'lib/pica-jm-source.jar'))).digest('hex')
        if (manifest.userDataIncluded !== false || manifest.statusProbe !== 'PASS' || manifest.sdkVersion !== 'v1.1.12' || manifest.jarSha256 !== jarHash) throw Error('JM runtime integrity gate failed')
        names.push(...files.map(file => 'runtime/jm/' + path.relative(source, file).replaceAll('\\', '/')))
        compositionFromPayload(names, JSON.stringify(composition))
        for (const file of files) {
            const destination = path.join(target, path.relative(source, file))
            fs.mkdirSync(path.dirname(destination), { recursive: true })
            fs.copyFileSync(file, destination, fs.constants.COPYFILE_EXCL)
        }
    }
    compositionFromPayload(names, JSON.stringify(composition))
    fs.writeFileSync(descriptor, JSON.stringify(composition, null, 2) + '\n', { flag: 'wx' })
    return { composition, copiedRuntimeFiles: names.length - 1, javaStarted: false }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
    const [stage, mode, ...extra] = process.argv.slice(2)
    if (!stage || !['core', 'jm'].includes(mode) || extra.length) throw Error('Usage: tsx scripts/stage-source-runtime.ts <fresh-stage> <core|jm>')
    console.log(JSON.stringify(stageSourceRuntime(stage, path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), { formatVersion: 1, sourceRuntimes: mode === 'jm' ? ['jm'] : [] })))
}
