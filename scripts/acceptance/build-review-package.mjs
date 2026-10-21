import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import AdmZip from 'adm-zip'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const args = Object.fromEntries(
    process.argv.slice(2).map((value) => {
        const index = value.indexOf('=')
        if (index < 3 || !value.startsWith('--'))
            throw new Error('Use --name=value arguments')
        return [value.slice(2, index), value.slice(index + 1)]
    })
)
const git = (...values) =>
    execFileSync(
        'git',
        [
            '-c',
            `safe.directory=${root.replaceAll('\\', '/')}`,
            '-C',
            root,
            ...values
        ],
        { maxBuffer: 512 * 1024 * 1024 }
    )
const sha = git('rev-parse', 'HEAD').toString().trim()
const tree = git('rev-parse', 'HEAD^{tree}').toString().trim()
if (git('status', '--porcelain').toString().trim())
    throw new Error('Freeze a clean source commit before packaging')
const stamp = new Date()
    .toISOString()
    .replaceAll(/[-:]/g, '')
    .replace(/\.\d+Z$/, 'Z')
const output = path.resolve(
    args.output ||
        path.join(
            root,
            '..',
            'deliverables',
            `PICA_NEXT_ACCEPTANCE_${stamp}_${sha.slice(0, 12)}`
        )
)
if (fs.existsSync(output))
    throw new Error('Output already exists; preserve previous handoffs')
fs.mkdirSync(output, { recursive: true })
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex')
const put = (name, value) => {
    const target = path.join(output, name)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, value)
}
put('SOURCE_SHA.txt', `${sha}\n`)
put('SOURCE_TREE.txt', `${tree}\n`)
put('source/CANDIDATE_SOURCE.zip', git('archive', '--format=zip', 'HEAD'))
put(
    'source/CHANGESET.patch',
    git(
        'diff',
        '--binary',
        args.base || 'origin/codex/post-v050-rc-readiness',
        'HEAD'
    )
)
for (const name of [
    'docs/NEXT_ACCEPTANCE_EXECUTION.md',
    'docs/JM_SOURCE_ADAPTER_ACCEPTANCE.md',
    'DEVELOPMENT_TASK_LOG.md',
    'LICENSE',
    'NOTICE.md',
    'docs/licenses/JMCOMIC_API_JAVA_MIT.txt'
]) {
    put(name, fs.readFileSync(path.join(root, name)))
}
const logs = [
    'desktop-final-tests.log',
    'browser-final.log',
    'android-final-build.log',
    'jm-runtime-build.log',
    'windows-candidate-build.log',
    'windows-candidate-smoke.log',
    'windows-upgrade-smoke.log'
]
for (const name of logs) {
    const source = path.join(root, 'artifacts', name)
    if (fs.existsSync(source))
        put(`validation/${name}`, fs.readFileSync(source))
}
const packages = []
if (args.windows) {
    const bytes = fs.readFileSync(path.resolve(args.windows)),
        archive = new AdmZip(bytes)
    if (archive.readAsText('SOURCE_SHA.txt').trim() !== sha)
        throw new Error('Windows package is not bound to this source')
    const runtime = JSON.parse(
        archive.readAsText('runtime/jm/PICA_JM_RUNTIME.json')
    )
    if (
        runtime.userDataIncluded ||
        runtime.statusProbe !== 'PASS' ||
        hash(archive.readFile('runtime/jm/lib/pica-jm-source.jar')) !==
            runtime.jarSha256
    )
        throw new Error('Packaged JM integrity gate failed')
    const name = 'installables/Pica-Library-Next-Acceptance-Windows-x64.zip'
    put(name, bytes)
    packages.push({
        name,
        sha256: hash(bytes),
        sourceSha: sha,
        jmRuntime: 'PASS'
    })
}
if (args.android) {
    if (!args['android-cert'] || !args['android-source'])
        throw new Error('Signed Android evidence is required')
    const certificate = fs
        .readFileSync(args['android-cert'], 'utf8')
        .trim()
        .toLowerCase()
    if (
        certificate !==
        '64fb87dc7d8bd6bc7b2cec92cc8c83fad3afe8cfb07591a2e53d53cbd3ab2f9d'
    )
        throw new Error('Unexpected Android certificate')
    if (fs.readFileSync(args['android-source'], 'utf8').trim() !== sha)
        throw new Error('Android package source mismatch')
    const bytes = fs.readFileSync(args.android),
        name = 'installables/Pica-Library-Next-Acceptance-Android-Dev.apk'
    put(name, bytes)
    put('validation/CERTIFICATE_SHA256.txt', `${certificate}\n`)
    packages.push({ name, sha256: hash(bytes), sourceSha: sha, certificate })
}
const status = {
    sourceSha: sha,
    sourceTree: tree,
    generatedAt: new Date().toISOString(),
    packages,
    status:
        args.windows && args.android
            ? 'AUTOMATED_CANDIDATE_READY_HUMAN_QA_PENDING'
            : 'PARTIAL_INSTALLABLE_GATES_PENDING',
    productionDataAccessed: false,
    productionDataModified: false,
    modelTraining: false,
    mainMerged: false,
    tagCreated: false,
    releasePublished: false,
    otaChanged: false,
    deployed: false,
    deviceQa: 'PENDING',
    realProviderQa: 'PENDING',
    remoteCi: args['ci-url'] || 'NOT_RUN_OR_NOT_AUTHORIZED'
}
put('GATES.json', `${JSON.stringify(status, null, 2)}\n`)
put(
    '00_READ_ME_FIRST.md',
    `# Pica Library — next consolidated acceptance\n\nSource: ${sha}\n\nStatus: ${status.status}\n\nThis is NOT a formal release and has not been deployed. Production data was not used. The included source ZIP is the complete frozen Git tree; CHANGESET.patch is relative to the readiness branch. Upstream links, licenses, limitations and the future acceptance checklist are in docs/.\n\nWindows, when included, uses **Pica Library Post Stable RC** under LOCALAPPDATA, not the formal Pica Library directory. Do not copy the formal database into RC. Android, when included, is the fixed-certificate **com.picalibrary.android.dev** side-by-side app. Never uninstall an existing Dev app to bypass signing/version mismatch. No local debug-signed APK is supplied as an upgrade substitute.\n\nNo manual test is requested now. Keep these packages for the next consolidated acceptance. Actual JM login, network/proxy/folder cases, device gestures and performance remain pending. Source extension installation and JM automatic recommendation recall are not completed in this slice.\n\nRollback: replace only the isolated application directory with its prior package; keep its data directory. Do not delete, migrate, or overwrite formal/RC/Dev data. This handoff itself performs no install or rollback.\n\nCheck SHA256SUMS.txt after extracting. See GATES.json for included installables and missing gates.\n`
)
put(
    'WEB_GPT_REVIEW_PROMPT.md',
    `Review the complete frozen source and patch at ${sha}. Separate implementation, synthetic tests, packaged startup, remote CI and physical/provider acceptance. Audit issue #199's read-only projection, #200's discovery/staged edits and missing-evidence wording, opt-in JM verified-account complete additive import, source namespace/Reader/download routing, credential/log/cache boundaries, SDK/license provenance, native Android SPI/R8/desugaring and preserved Reader gestures. Do not infer human acceptance or recommendation-science improvement. Flag remaining gaps, especially compiled adapters versus dynamic extensions, Android native download/sync/proxy/localization, and JM candidate recall. Do not request production databases, secrets, recovered APK material, main merge or release.\n`
)
function files(directory, prefix = '') {
    return fs
        .readdirSync(directory, { withFileTypes: true })
        .flatMap((entry) => {
            const name = prefix + entry.name
            return entry.isDirectory()
                ? files(path.join(directory, entry.name), `${name}/`)
                : [name]
        })
        .sort()
}
const sums = files(output).map(
    (name) => `${hash(fs.readFileSync(path.join(output, name)))}  ${name}`
)
put('SHA256SUMS.txt', sums.join('\n') + '\n')
const archive = new AdmZip()
for (const name of files(output))
    archive.addFile(name, fs.readFileSync(path.join(output, name)))
const zip = `${output}.zip`
archive.writeZip(zip)
const reread = new AdmZip(zip)
for (const line of sums) {
    const digest = line.slice(0, 64),
        name = line.slice(66)
    if (hash(reread.readFile(name)) !== digest)
        throw new Error(`ZIP integrity mismatch: ${name}`)
}
const digest = hash(fs.readFileSync(zip))
fs.writeFileSync(`${zip}.sha256`, `${digest}  ${path.basename(zip)}\n`)
process.stdout.write(
    JSON.stringify({
        status: status.status,
        sourceSha: sha,
        package: zip,
        sha256: digest,
        files: reread.getEntries().length
    }) + '\n'
)
