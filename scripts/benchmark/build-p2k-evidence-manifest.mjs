import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

function option(name) {
    const prefix = `--${name}=`
    const inline = process.argv.slice(2).find((value) => value.startsWith(prefix))
    if (inline) return inline.slice(prefix.length)
    const index = process.argv.indexOf(`--${name}`)
    return index >= 0 ? process.argv[index + 1] : undefined
}

function readJson(file) {
    const text = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')
    return JSON.parse(text)
}

function sha256(file) {
    return crypto
        .createHash('sha256')
        .update(fs.readFileSync(file))
        .digest('hex')
}

function filesRecursively(root) {
    const result = []
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
        const target = path.join(root, entry.name)
        if (entry.isDirectory()) result.push(...filesRecursively(target))
        else result.push(target)
    }
    return result
}

const rootArg = option('root')
const commit = String(option('commit') ?? '').trim()
const evidenceType = String(
    option('evidence-type') ?? 'p2-k-windows-x64-reference'
).trim()
if (!/^[a-z0-9][a-z0-9-]{2,80}$/.test(evidenceType))
    throw new Error('--evidence-type is invalid')
if (!rootArg) throw new Error('--root is required')
if (!/^[0-9a-f]{40}$/i.test(commit))
    throw new Error('--commit must be a 40-character git SHA')

const root = path.resolve(rootArg)
if (!fs.existsSync(root) || !fs.statSync(root).isDirectory())
    throw new Error('P2-K evidence root does not exist')

const environmentFile = path.join(root, 'environment.json')
const statusFile = path.join(root, 'run-status.json')
if (!fs.existsSync(environmentFile) || !fs.existsSync(statusFile))
    throw new Error('P2-K evidence root requires environment.json and run-status.json')

const environment = readJson(environmentFile)
const status = readJson(statusFile)
if (String(environment.commit ?? '') !== commit || String(status.commit ?? '') !== commit)
    throw new Error('P2-K evidence commit mismatch between manifest inputs')
if (
    environment.evidenceType &&
    String(environment.evidenceType) !== evidenceType
)
    throw new Error('P2-K environment evidence type does not match requested manifest type')
if (status.evidenceType && String(status.evidenceType) !== evidenceType)
    throw new Error('P2-K run-status evidence type does not match requested manifest type')
const androidPhysicalEvidenceTypes = new Set([
    'p2-k-android-physical-reference',
    'p2-k-android-manual-acceptance'
])
if (androidPhysicalEvidenceTypes.has(evidenceType)) {
    if (
        environment.physicalDeviceRequired !== true ||
        environment.emulatorAccepted !== false
    )
        throw new Error('Android P2-K evidence must declare physical-device-only policy')
    if (!/^[0-9a-f]{64}$/i.test(String(environment?.device?.serialSha256 ?? '')))
        throw new Error('Android P2-K evidence requires a hashed physical-device identity')
}
const manualAcceptanceEvidenceTypes = new Set([
    'p2-k-windows-manual-acceptance',
    'p2-k-android-manual-acceptance'
])
if (manualAcceptanceEvidenceTypes.has(evidenceType)) {
    if (
        environment.manualAcceptance !== true ||
        environment.humanJudgmentRequired !== true
    )
        throw new Error('K4 manual acceptance evidence must declare human-judgment authority')
}
if (
    evidenceType === 'p2-k-windows-manual-acceptance' &&
    environment.nativeWindowsRequired !== true
)
    throw new Error('Windows K4 evidence must declare native-Windows authority')

const manifestName = 'p2k-evidence-manifest.json'
const files = filesRecursively(root)
    .filter((file) => path.basename(file) !== manifestName)
    .sort((left, right) => left.localeCompare(right))
    .map((file) => {
        const relative = path.relative(root, file).replaceAll(path.sep, '/')
        const row = {
            path: relative,
            bytes: fs.statSync(file).size,
            sha256: sha256(file)
        }
        if (file.endsWith('.json')) {
            try {
                const value = readJson(file)
                row.json = {
                    schemaVersion: value?.schemaVersion ?? null,
                    benchmark: value?.benchmark ?? null
                }
            } catch {
                row.json = { parseError: true }
            }
        }
        return row
    })

const runs = Array.isArray(status.runs) ? status.runs : []
function successfulRun(run) {
    const output = path.join(root, String(run.output ?? ''))
    return (
        Number(run.exitCode) === 0 &&
        run.outputExists === true &&
        fs.existsSync(output)
    )
}
const allRecordedRunsSuccessful =
    runs.length > 0 && runs.every((run) => successfulRun(run))
const requiredRunIdsByEvidenceType = {
    'p2-k-android-physical-reference': [
        'G18_IDLE',
        'G19_RECOMMENDATION_LOADED'
    ],
    'p2-k-windows-manual-acceptance': [
        'WINDOWS_LONG_TASK_VISIBLE',
        'WINDOWS_PAUSE_RESUME',
        'WINDOWS_CANCEL',
        'WINDOWS_FOREGROUND_USABILITY'
    ],
    'p2-k-android-manual-acceptance': [
        'ANDROID_TASK_CENTER_VISIBILITY',
        'ANDROID_FOREGROUND_NOTIFICATION',
        'ANDROID_PAUSE_RESUME_CANCEL',
        'ANDROID_BACKGROUND_OEM',
        'ANDROID_FOREGROUND_USABILITY'
    ]
}
const requiredRunIds = requiredRunIdsByEvidenceType[evidenceType] ?? []
const requiredRunsComplete = requiredRunIds.every((id) => {
    const run = runs.find((item) => item?.id === id)
    return Boolean(run && successfulRun(run))
})
const complete =
    allRecordedRunsSuccessful &&
    (requiredRunIds.length === 0 || requiredRunsComplete)

const manifest = {
    schemaVersion: 1,
    evidenceType,
    generatedAt: new Date().toISOString(),
    commit,
    dirty: status.dirty === true,
    complete,
    budgetSelected: false,
    concurrencyCapacitySelected: false,
    environment,
    runStatus: status,
    files,
    externalEvidenceStillRequired:
        evidenceType === 'p2-k-android-physical-reference'
            ? [
                  'repeated representative Android physical-device runs',
                  'Android explicit real download-loaded navigation',
                  'Android recommendation + real download overlap',
                  'Android Reader interaction under representative background load',
                  'Android long Reader memory/jank evidence',
                  'manual Android task-control acceptance',
                  'Windows K1 and real Provider/Visual evidence review'
              ]
            : evidenceType === 'p2-k-android-manual-acceptance'
              ? [
                    'K2/K3 repeated representative Android performance evidence',
                    'Windows K1/manual acceptance',
                    'J7B real Provider and J10 real Visual evidence review'
                ]
              : evidenceType === 'p2-k-windows-manual-acceptance'
                ? [
                      'repeated Windows K1 benchmark evidence',
                      'Android K2/K3/manual acceptance',
                      'J7B real Provider and J10 real Visual evidence review'
                  ]
                : [
                      'J7B real Provider regeneration with approved provider/network context',
                      'J10 repeated representative cold-cache and warm-cache real-model evidence',
                      'Android representative physical-device G18/G19 evidence',
                      'Android explicit real download and Reader loaded scenarios',
                      'manual Windows and Android task-control acceptance'
                  ],
    warning:
        'This manifest is an evidence bundle index, not a performance verdict. Thresholds and resource capacities remain unset until representative evidence is reviewed.'
}

fs.writeFileSync(
    path.join(root, manifestName),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8'
)
process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`)
