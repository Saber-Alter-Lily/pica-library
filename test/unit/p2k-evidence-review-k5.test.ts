import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

const SCRIPT = path.resolve('scripts/benchmark/review-p2k-evidence.mjs')
const COMMIT = 'a'.repeat(40)

const REQUIRED: Record<string, string[]> = {
  'p2-k-windows-x64-reference': [
    'J3_DESKTOP_STARTUP',
    'J4_BROWSER_HOME_LIBRARY',
    'J5_DETAIL_SHELF_READER',
    'J6_READER_LONG_SESSION',
    'J7A_RECOMMENDATION_BATCH',
    'J8_ACTIVE_DOWNLOAD',
    'J9_WEBDAV',
    'J11_OVERLAP'
  ],
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

function writeJson(file: string, value: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', 'utf8')
}

function sha256(file: string) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
}

function environment(type: string, commit = COMMIT) {
  if (type === 'p2-k-windows-x64-reference')
    return {
      schemaVersion: 1,
      evidenceType: type,
      commit,
      platform: 'win32',
      architecture: 'AMD64',
      computer: { model: 'fixture-windows' }
    }
  if (type === 'p2-k-android-physical-reference')
    return {
      schemaVersion: 1,
      evidenceType: type,
      commit,
      physicalDeviceRequired: true,
      emulatorAccepted: false,
      device: {
        serialSha256: 'b'.repeat(64),
        model: 'fixture-android',
        api: 35,
        abi: 'arm64-v8a'
      }
    }
  if (type === 'p2-k-windows-manual-acceptance')
    return {
      schemaVersion: 1,
      evidenceType: type,
      commit,
      manualAcceptance: true,
      humanJudgmentRequired: true,
      nativeWindowsRequired: true,
      platform: { type: 'Windows_NT', arch: 'x64' },
      hardware: { cpuModel: 'fixture-windows' }
    }
  return {
    schemaVersion: 1,
    evidenceType: type,
    commit,
    manualAcceptance: true,
    humanJudgmentRequired: true,
    physicalDeviceRequired: true,
    emulatorAccepted: false,
    platform: 'android',
    device: {
      serialSha256: 'c'.repeat(64),
      model: 'fixture-android',
      api: 35,
      abi: 'arm64-v8a'
    }
  }
}

function manifestRoot(
  parent: string,
  type: string,
  {
    commit = COMMIT,
    visual = false,
    dropRun = ''
  }: { commit?: string; visual?: boolean; dropRun?: string } = {}
) {
  const root = path.join(parent, type.replaceAll('/', '-'))
  fs.mkdirSync(root, { recursive: true })
  const env = environment(type, commit)
  writeJson(path.join(root, 'environment.json'), env)
  const ids = [...(REQUIRED[type] ?? [])]
  if (visual && type === 'p2-k-windows-x64-reference')
    ids.push('J10_VISUAL_REAL_MODEL')
  const runs = ids
    .filter((id) => id !== dropRun)
    .map((id) => {
      const output = `${id}.json`
      writeJson(path.join(root, output), { schemaVersion: 1, benchmark: id, value: 1 })
      return { id, output, outputExists: true, exitCode: 0 }
    })
  const status = {
    schemaVersion: 1,
    evidenceType: type,
    commit,
    dirty: false,
    includeVisual: visual,
    runs
  }
  writeJson(path.join(root, 'run-status.json'), status)
  const indexed = fs
    .readdirSync(root)
    .filter((name) => name !== 'p2k-evidence-manifest.json')
    .sort()
    .map((name) => {
      const file = path.join(root, name)
      return { path: name, bytes: fs.statSync(file).size, sha256: sha256(file) }
    })
  writeJson(path.join(root, 'p2k-evidence-manifest.json'), {
    schemaVersion: 1,
    evidenceType: type,
    commit,
    dirty: false,
    complete: true,
    budgetSelected: false,
    concurrencyCapacitySelected: false,
    environment: env,
    runStatus: status,
    files: indexed
  })
  return root
}

function k3Root(parent: string, scenario: 'real-download-loaded-navigation' | 'real-reader-under-download', commit = COMMIT) {
  const root = path.join(parent, scenario)
  fs.mkdirSync(root, { recursive: true })
  writeJson(path.join(root, 'fixture-benchmarkData.json'), {
    schemaVersion: 1,
    benchmark: scenario
  })
  writeJson(path.join(root, 'session.json'), {
    schemaVersion: 1,
    evidenceType: 'p2-k-android-real-load-k3',
    scenario,
    commit,
    dirty: false,
    physicalDeviceRequired: true,
    emulatorAccepted: false,
    device: {
      serialSha256: 'd'.repeat(64),
      model: 'fixture-android',
      api: 35,
      abi: 'arm64-v8a'
    },
    realInput:
      scenario === 'real-reader-under-download'
        ? {
            comicIdSha256: 'e'.repeat(64),
            episodeIdSha256: 'f'.repeat(64),
            source: 'pica'
          }
        : {
            comicIdSha256: null,
            episodeIdSha256: null,
            source: 'pica'
          },
    rawIdsPersisted: false,
    syntheticMediaAccepted: false,
    exitCode: 0,
    budgetSelected: false,
    concurrencyCapacitySelected: false
  })
  return root
}

function externalSidecar(parent: string, type: string, commit = COMMIT) {
  const root = path.join(parent, type)
  fs.mkdirSync(root, { recursive: true })
  const artifact = path.join(root, 'evidence.txt')
  fs.writeFileSync(artifact, 'fixture evidence\n', 'utf8')
  const sidecar = path.join(root, 'external.json')
  writeJson(sidecar, {
    schemaVersion: 1,
    evidenceType: type,
    commit,
    dirty: false,
    complete: true,
    budgetSelected: false,
    concurrencyCapacitySelected: false,
    environment: {
      platform: 'win32',
      architecture: 'AMD64'
    },
    artifacts: [
      {
        path: 'evidence.txt',
        bytes: fs.statSync(artifact).size,
        sha256: sha256(artifact)
      }
    ]
  })
  return sidecar
}

function runReview(args: string[]) {
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd: process.cwd(),
    encoding: 'utf8'
  })
}

describe('P2-K5 evidence review aggregator', () => {
  it('accepts a structurally complete same-commit K1-K4 + external matrix without choosing budgets', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'p2k-k5-complete-'))
    const output = path.join(tmp, 'review.json')
    const roots = [
      manifestRoot(tmp, 'p2-k-windows-x64-reference', { visual: true }),
      manifestRoot(tmp, 'p2-k-android-physical-reference'),
      manifestRoot(tmp, 'p2-k-windows-manual-acceptance'),
      manifestRoot(tmp, 'p2-k-android-manual-acceptance'),
      k3Root(tmp, 'real-download-loaded-navigation'),
      k3Root(tmp, 'real-reader-under-download')
    ]
    const external = [
      externalSidecar(tmp, 'p2-k-j7b-real-provider'),
      externalSidecar(tmp, 'p2-k-windows-low-end-trace')
    ]
    const result = runReview([
      ...roots.map((root) => `--root=${root}`),
      ...external.map((file) => `--external=${file}`),
      `--target-commit=${COMMIT}`,
      `--output=${output}`,
      '--require-complete'
    ])
    expect(result.status).toBe(0)
    const report = JSON.parse(fs.readFileSync(output, 'utf8'))
    expect(report.structuralEvidenceComplete).toBe(true)
    expect(report.decisionStatus).toBe('READY_FOR_HUMAN_VARIANCE_AND_BUDGET_REVIEW')
    expect(report.humanVarianceReviewRequired).toBe(true)
    expect(report.minimumRepetitionCountSelected).toBe(false)
    expect(report.budgetSelected).toBe(false)
    expect(report.concurrencyCapacitySelected).toBe(false)
    for (const row of Object.values(report.matrix) as Array<{ validCount: number }>)
      expect(row.validCount).toBeGreaterThanOrEqual(1)
  })

  it('keeps the review incomplete when a required external evidence category is absent', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'p2k-k5-missing-'))
    const output = path.join(tmp, 'review.json')
    const root = manifestRoot(tmp, 'p2-k-windows-x64-reference', { visual: true })
    const result = runReview([
      `--root=${root}`,
      `--output=${output}`,
      '--require-complete'
    ])
    expect(result.status).toBe(2)
    const report = JSON.parse(fs.readFileSync(output, 'utf8'))
    expect(report.structuralEvidenceComplete).toBe(false)
    expect(report.decisionStatus).toBe('EVIDENCE_INCOMPLETE')
    expect(report.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'MISSING_REQUIRED_EVIDENCE',
          category: 'J7B_REAL_PROVIDER'
        })
      ])
    )
  })

  it('rejects a hand-crafted complete manifest that omits a required K2 run', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'p2k-k5-required-run-'))
    const output = path.join(tmp, 'review.json')
    const root = manifestRoot(tmp, 'p2-k-android-physical-reference', {
      dropRun: 'G19_RECOMMENDATION_LOADED'
    })
    const result = runReview([
      `--root=${root}`,
      `--output=${output}`,
      '--require-complete'
    ])
    expect(result.status).toBe(2)
    const report = JSON.parse(fs.readFileSync(output, 'utf8'))
    expect(report.inputs[0].valid).toBe(false)
    expect(report.inputs[0].errors.join(' ')).toContain('G19_RECOMMENDATION_LOADED')
  })

  it('rejects indexed evidence that was modified after the manifest was written', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'p2k-k5-tamper-'))
    const output = path.join(tmp, 'review.json')
    const root = manifestRoot(tmp, 'p2-k-windows-x64-reference')
    fs.appendFileSync(path.join(root, 'environment.json'), 'tamper\n', 'utf8')
    const result = runReview([
      `--root=${root}`,
      `--output=${output}`,
      '--require-complete'
    ])
    expect(result.status).toBe(2)
    const report = JSON.parse(fs.readFileSync(output, 'utf8'))
    expect(report.inputs[0].valid).toBe(false)
    expect(report.inputs[0].errors.join(' ')).toContain('SHA-256 mismatch')
  })

  it('blocks structurally valid evidence mixed across different commits', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'p2k-k5-commit-'))
    const output = path.join(tmp, 'review.json')
    const one = manifestRoot(path.join(tmp, 'one'), 'p2-k-windows-x64-reference')
    const two = manifestRoot(path.join(tmp, 'two'), 'p2-k-android-physical-reference', {
      commit: '9'.repeat(40)
    })
    const result = runReview([
      `--root=${one}`,
      `--root=${two}`,
      `--output=${output}`,
      '--require-complete'
    ])
    expect(result.status).toBe(2)
    const report = JSON.parse(fs.readFileSync(output, 'utf8'))
    expect(report.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'EVIDENCE_COMMIT_MISMATCH' })
      ])
    )
  })
})
