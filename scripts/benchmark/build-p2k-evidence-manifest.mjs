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
const androidRequiredRunIds = [
    'G18_IDLE',
    'G19_RECOMMENDATION_LOADED'
]
const androidRequiredRunsComplete = androidRequiredRunIds.every((id) => {
    const run = runs.find((item) => item?.id === id)
    return Boolean(run && successfulRun(run))
})
const complete =
    evidenceType === 'p2-k-android-physical-reference'
        ? allRecordedRunsSuccessful && androidRequiredRunsComplete
        : allRecordedRunsSuccessful

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
