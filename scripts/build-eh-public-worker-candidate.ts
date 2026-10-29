/**
 * S3 E-H public reader: reproducible UNSIGNED worker candidate / inventory.
 *
 * Reuses esbuild and the existing signed-worker v1 envelope shape. This tool
 * deliberately has NO signing key, signature, network, installer, publisher
 * trust store or output worker file. It prints metadata-only evidence.
 *
 * Development-only: NEVER treat this candidate as a distributable extension.
 */
import { createHash } from 'node:crypto'
import { isBuiltin } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import type { SignedSourceWorkerRelease } from '../src/source-extensions/signed-worker-store'

const ROOT = path.resolve(fileURLToPath(new URL('../', import.meta.url)))
const SOURCE_ID = 'eh-public-reader'
const ENTRY = 'src/source-extensions/workers/eh-public-worker.ts'
const VERSION = /^(0|[1-9]\d{0,3})\.(0|[1-9]\d{0,3})\.(0|[1-9]\d{0,3})$/
const MAX_WORKER_BYTES = 1024 * 1024

// An explicit small first-party allowlist, not "all src" or a regex matching
// node_modules. A dependency change requires actual review in this script.
const APPROVED_INPUTS = new Set([
    ENTRY,
    'src/source-extensions/eh-public-identity.ts',
    'src/source-extensions/eh-public-reader-transport.ts',
    'src/source-extensions/reader-contract.ts',
    'src/providers/eh-provider.ts',
    'src/providers/eh-tags.ts',
    'src/media/abort-signals.ts',
    'src/media/url-policy.ts',
    'src/library/cover-url.ts'
])

const normalized = (value: string) => value.replaceAll('\\', '/')

export type UnsignedEhWorkerRelease = Omit<SignedSourceWorkerRelease, 'signature'>

export interface EhWorkerCandidate {
    /** Temporary bytes for offline QA; the CLI NEVER writes these bytes. */
    bytes: Uint8Array
    release: UnsignedEhWorkerRelease
    /** Normalized source-only entries in esbuild's actual dependency graph. */
    sourceInputs: string[]
    /** Only Node.js builtins may remain as unbundled imports. */
    externalImports: string[]
}

export async function buildEhPublicWorkerCandidate(
    version = '0.0.1'
): Promise<EhWorkerCandidate> {
    if (!VERSION.test(version))
        throw new Error('Signed source version must be exact three-part semver')

    const result = await build({
        absWorkingDir: ROOT,
        entryPoints: [ENTRY],
        // Constant, in-memory output location: no package is written/staged.
        outfile: path.join(ROOT, '.s3-unsigned-qa', 'worker.cjs'),
        bundle: true,
        platform: 'node',
        format: 'cjs',
        target: 'node22',
        legalComments: 'inline',
        metafile: true,
        write: false,
        logLevel: 'silent'
    })
    if (result.errors.length || !result.metafile || result.outputFiles?.length !== 1)
        throw new Error('E-H candidate must compile to exactly one file')

    const sourceInputs = Object.keys(result.metafile.inputs)
        .map(normalized).sort()
    if (sourceInputs.length !== APPROVED_INPUTS.size ||
        sourceInputs.some(input => !APPROVED_INPUTS.has(input)) ||
        [...APPROVED_INPUTS].some(input => !sourceInputs.includes(input)))
        throw new Error('E-H worker unexpectedly gained/lost a source dependency')

    const outputs = Object.values(result.metafile.outputs)
    if (outputs.length !== 1 || outputs[0].entryPoint !== ENTRY)
        throw new Error('E-H candidate must have one fixed source entrypoint')
    const externalImports = outputs[0].imports.map(entry => entry.path).sort()
    if (outputs[0].imports.some(entry =>
        !entry.external || !isBuiltin(entry.path)) ||
        outputs[0].exports.length !== 0)
        throw new Error('E-H worker may import only Node builtins; no npm or runtime loader')

    const bytes = result.outputFiles[0].contents
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_WORKER_BYTES)
        throw new Error('E-H candidate exceeds signed-worker v1 size bound')

    return {
        bytes,
        release: {
            schemaVersion: 1,
            sourceId: SOURCE_ID,
            version,
            size: bytes.byteLength,
            sha256: createHash('sha256').update(bytes).digest('hex')
        },
        sourceInputs,
        externalImports
    }
}

async function main() {
    // No --output, --sign, --install or arbitrary compiler input accepted.
    if (process.argv.length !== 2)
        throw new Error('This command only supports metadata-only QA')
    const candidate = await buildEhPublicWorkerCandidate()
    process.stdout.write(JSON.stringify({
        status: 'UNSIGNED_QA_ONLY_NOT_INSTALLABLE',
        schemaVersion: candidate.release.schemaVersion,
        sourceId: candidate.release.sourceId,
        version: candidate.release.version,
        size: candidate.release.size,
        sha256: candidate.release.sha256,
        sourceInputs: candidate.sourceInputs,
        externalImports: candidate.externalImports,
        workerBytesIncluded: false,
        productionSignature: false
    }, null, 2) + '\n')
}

if (process.argv[1] &&
    path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
    main().catch(error => {
        process.stderr.write(String(error instanceof Error ? error.message : error) + '\n')
        process.exitCode = 1
    })
