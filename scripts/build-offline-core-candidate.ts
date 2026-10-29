/**
 * S3 unshipped offline-core binary proof. Existing esbuild + existing
 * SQLite/local ingestion/Reader; NO duplicate Reader or source plugin SDK.
 *
 * Metadata-only CLI: the runnable code is kept in memory and only emitted
 * inside disposable test fixtures, never as a release/artifact.
 */
import { createHash } from 'node:crypto'
import { isBuiltin } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const ROOT = path.resolve(fileURLToPath(new URL('../', import.meta.url)))
const ENTRY = 'src/offline-core/qa-cli.ts'
const REQUIRE_SOURCE = [
    ENTRY,
    'src/library/database.ts',
    'src/local-library/ingestion.ts',
    'src/services/reader-service.ts',
    'src/reader/local-http-read.ts',
    'src/library/core-catalog-read.ts',
    'src/library/core-bootstrap-read.ts',
    'src/app-capabilities.ts',
    'src/version.ts',
    'src/modules/contracts.ts',
    'src/services/library-query-service.ts',
    'src/library/core-shelf-routes.ts',
    'src/library/core-local-import.ts',
    'src/library/core-runtime-composition.ts',
    'src/services/shelf-service.ts',
    'src/offline-core/qa-http.ts',
    'src/offline-core/full-web-qa-assets.ts'
]
const PROHIBITED = [
    /^src\/sdk(?:\/|\.ts$)/,
    /^src\/providers\//,
    /^src\/desktop\//,
    /^src\/source-extensions\//,
    /^src\/source-hosts\//,
    /^src\/remote-api\//,
    /^src\/services\/(?:provider-service|online-reader-service)\.ts$/,
    /^source-jvm\//,
    /^mobile\//
]
const normalized = (value: string) => value.replaceAll('\\', '/')

export interface OfflineCoreCandidate {
    bytes: Uint8Array
    sha256: string
    sourceInputs: string[]
    packageInputs: string[]
    externalImports: string[]
}

export async function buildOfflineCoreCandidate(): Promise<OfflineCoreCandidate> {
    const compiled = await build({
        absWorkingDir: ROOT,
        entryPoints: [ENTRY],
        outfile: path.join(ROOT, '.s3-offline-core-qa', 'core.mjs'),
        bundle: true,
        // AdmZip's optional Electron-only require('original-fs') is not a
        // Node builtin. This QA executable is Node-only: map that single
        // optional compatibility hook to the audited native fs module.
        // Do not ignore or wholesale externalize unknown dependencies.
        alias: { 'original-fs': 'node:fs' },
        platform: 'node',
        target: 'node24',
        format: 'esm',
        // Existing LibraryDatabase uses createRequire(import.meta.url) for
        // node:sqlite. The bundled AdmZip CommonJS shim also needs a trusted
        // Node builtin require in the ESM entry (not a source/plugin loader).
        banner: { js: "import { createRequire as __coreRequire } from 'node:module'; const require = __coreRequire(import.meta.url);" },
        write: false,
        metafile: true,
        logLevel: 'silent',
        legalComments: 'inline'
    })
    if (compiled.errors.length || !compiled.metafile ||
        compiled.outputFiles?.length !== 1)
        throw new Error('Source-free offline core must compile as one file')
    const output = Object.values(compiled.metafile.outputs)
    if (output.length !== 1 || output[0].entryPoint !== ENTRY ||
        output[0].exports.length !== 0)
        throw new Error('Offline QA core has an unexpected build entry or output')

    const inputs = Object.keys(compiled.metafile.inputs).map(normalized).sort()
    const sourceInputs = inputs.filter(item => item.startsWith('src/'))
    const packageInputs = inputs.filter(item => !item.startsWith('src/'))
    for (const required of REQUIRE_SOURCE)
        if (!sourceInputs.includes(required))
            throw new Error('Offline core lost an actual local Reader dependency: ' + required)
    for (const item of sourceInputs)
        if (PROHIBITED.some(pattern => pattern.test(item)))
            throw new Error('Offline core includes executable source/Host code: ' + item)
    // The actual PRODUCT_VERSION in src/version.ts imports exactly the root
    // package.json as inert build-time version metadata. This is NOT blanket
    // permission for JSON loaders, runtime npm packages or executable plugins.
    // AdmZip remains the sole reviewed third-party executable dependency.
    if (!packageInputs.includes('package.json') ||
        !sourceInputs.includes('src/version.ts'))
        throw new Error('Original version metadata is missing from core bootstrap')
    for (const item of packageInputs)
        if (item !== 'package.json' && !/node_modules\/adm-zip\//.test(item))
            throw new Error('Offline core gained an unreviewed runtime dependency: ' + item)

    const externalImports = output[0].imports.map(item => item.path).sort()
    if (output[0].imports.some(item =>
        !item.external || !isBuiltin(item.path)))
        throw new Error('Offline core contains non-Node external code imports: ' + JSON.stringify(output[0].imports))
    const bytes = compiled.outputFiles[0].contents
    if (!bytes.byteLength || bytes.byteLength > 8 * 1024 * 1024)
        throw new Error('Offline core bundle missing or exceeds QA size bound')

    return {
        bytes,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        sourceInputs,
        packageInputs,
        externalImports
    }
}

async function main() {
    if (process.argv.length !== 2)
        throw new Error('This QA tool only prints an unsigned dependency manifest')
    const candidate = await buildOfflineCoreCandidate()
    process.stdout.write(JSON.stringify({
        status: 'DISPOSABLE_OFFLINE_QA_NOT_DISTRIBUTABLE',
        sha256: candidate.sha256,
        bytes: candidate.bytes.length,
        executableOutputIncluded: false,
        providerSdkInBundle: false,
        sourceInputs: candidate.sourceInputs,
        packageInputs: candidate.packageInputs,
        externalImports: candidate.externalImports
    }, null, 2) + '\n')
}

if (process.argv[1] &&
    path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
    main().catch(error => {
        process.stderr.write(
            (error instanceof Error ? error.message : String(error)) + '\n')
        process.exitCode = 1
    })
