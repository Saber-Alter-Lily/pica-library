import fs from 'node:fs'
import path from 'node:path'

const automated = {
    desktopContracts: process.env.P2_GATE_DESKTOP ?? 'unknown',
    windowsPackageSmoke: process.env.P2_GATE_WINDOWS ?? 'unknown',
    androidStatic: process.env.P2_GATE_ANDROID ?? 'unknown',
    androidForceStopRecovery: process.env.P2_GATE_FORCE_STOP ?? 'unknown',
    androidMemoryBackground: process.env.P2_GATE_MEMORY_BACKGROUND ?? 'unknown'
}

const allAutomatedPass = Object.values(automated).every(
    (value) => value === 'success'
)

const report = {
    schemaVersion: 1,
    gate: 'P2-runtime-hardening-promotion',
    sourceSha: process.env.P2_GATE_SHA ?? null,
    candidateHeadSha:
        process.env.P2_GATE_CANDIDATE_HEAD_SHA ??
        process.env.P2_GATE_SHA ??
        null,
    generatedAt: new Date().toISOString(),
    automatedStatus: allAutomatedPass ? 'PASS' : 'FAIL',
    promotionStatus: allAutomatedPass
        ? 'AUTOMATED_PASS_EXTERNAL_EVIDENCE_REQUIRED'
        : 'AUTOMATED_FAIL',
    automatedGates: automated,
    automatedScope: [
        'TypeScript + full unit/integration suite',
        'Web syntax + production build + real Chromium smoke',
        'long-task stability contract',
        'recommendation network interruption recovery',
        'large download queue + detached download runtime',
        'runtime resource/concurrency observation contracts',
        'structured task diagnostics contracts',
        'Desktop shutdown/recovery contracts',
        'Windows current-version packaged artifact smoke',
        'Android unit/lint/release + Macrobenchmark harness build',
        'Android real force-stop/relaunch recovery',
        'Android real trim-memory + Doze durable recovery'
    ],
    externalBlockers: [
        {
            id: 'P2-K-REAL-BENCHMARK-MATRIX',
            status: 'REQUIRED',
            reason:
                'Performance budgets require representative real hardware, environment and variance; CI/synthetic timings are not accepted.'
        },
        {
            id: 'WINDOWS-MANUAL-TASK-CONTROL',
            status: 'REQUIRED',
            reason:
                'Representative Windows task-control acceptance must confirm heavy work remains visible, controllable and non-freezing.'
        },
        {
            id: 'ANDROID-PHYSICAL-TASK-CONTROL',
            status: 'REQUIRED',
            reason:
                'Representative Android physical-device acceptance must cover task controls, foreground notification/OEM background behavior and loaded foreground performance.'
        },
        {
            id: 'ANDROID-G18-G19-PHYSICAL-PERFORMANCE',
            status: 'REQUIRED',
            reason:
                'G18 idle and G19 real recommendation-loaded Macrobenchmark evidence must be collected on representative physical hardware before G20/P2-C3 enforcement.'
        },
        {
            id: 'LOW-END-WINDOWS-BROWSER-TRACE',
            status: 'REQUIRED',
            reason:
                'P2-F still requires representative low-end Windows/browser CPU+jank evidence before claiming UI smoothness closure.'
        }
    ],
    interpretation:
        'Automated PASS proves checked-in regression coverage only. It does not by itself satisfy the P2 exit criterion or authorize performance/resource budgets.'
}

const output =
    process.env.P2_GATE_OUTPUT ??
    path.join('test-results', 'p2-runtime-hardening-gate.json')
fs.mkdirSync(path.dirname(output), { recursive: true })
fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n', 'utf8')
console.log(JSON.stringify(report, null, 2))

if (!allAutomatedPass) process.exitCode = 1
