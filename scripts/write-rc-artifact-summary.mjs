import fs from 'node:fs'
import path from 'node:path'

const sourceSha = process.env.RC_SOURCE_SHA || ''
if (!/^[0-9a-f]{40}$/.test(sourceSha))
    throw new Error('An exact source SHA is required')
const event = process.env.RC_EVENT
const contract = process.env.RC_CONTRACT_RESULT
const windows = process.env.RC_WINDOWS_RESULT
const android = process.env.RC_ANDROID_RESULT
if (!['push', 'workflow_dispatch', 'pull_request'].includes(event)) {
    throw new Error('Unsupported RC workflow event')
}
for (const state of [contract, windows, android]) {
    if (!['success', 'failure', 'cancelled', 'skipped'].includes(state)) {
        throw new Error(
            'An explicit terminal result is required for every RC job'
        )
    }
}
const contractOnly = event === 'pull_request'
const ready =
    contract === 'success' && windows === 'success' && android === 'success'
const successful = contractOnly
    ? contract === 'success' && windows === 'skipped' && android === 'skipped'
    : ready
const result = {
    sourceSha,
    event,
    jobs: { contract, windows, android },
    status: !successful
        ? 'FAILED_OR_INCOMPLETE'
        : contractOnly
          ? 'CONTRACT_ONLY_NO_INSTALLABLE_ARTIFACTS'
          : 'INSTALLABLE_ARTIFACTS_READY_MANUAL_QA_PENDING',
    installableArtifactsReady: !contractOnly && ready,
    manualQa: 'PENDING',
    p2PhysicalEvidence: 'PENDING',
    stableReleaseModified: false,
    otaModified: false
}
const output = path.resolve(process.argv[2] || 'candidate/RC_STATUS.json')
fs.mkdirSync(path.dirname(output), { recursive: true })
fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n')
console.log(JSON.stringify(result, null, 2))
if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(
        process.env.GITHUB_STEP_SUMMARY,
        `## RC artifact status\n\n${result.status}\n\nSource: \`${sourceSha}\`\n\nWindows: ${windows}; Android: ${android}. Manual/physical QA remains pending.\n`
    )
}
if (!successful) process.exitCode = 1
