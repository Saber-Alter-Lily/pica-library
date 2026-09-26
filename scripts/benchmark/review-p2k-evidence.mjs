#!/usr/bin/env node
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const REQUIRED_CATEGORIES = Object.freeze([
  'WINDOWS_K1_REFERENCE',
  'ANDROID_K2_G18_G19',
  'ANDROID_K3_DOWNLOAD',
  'ANDROID_K3_READER',
  'WINDOWS_K4_MANUAL',
  'ANDROID_K4_MANUAL',
  'J7B_REAL_PROVIDER',
  'J10_REAL_VISUAL',
  'WINDOWS_LOW_END_TRACE'
])

const MANIFEST_CATEGORY = Object.freeze({
  'p2-k-windows-x64-reference': 'WINDOWS_K1_REFERENCE',
  'p2-k-android-physical-reference': 'ANDROID_K2_G18_G19',
  'p2-k-windows-manual-acceptance': 'WINDOWS_K4_MANUAL',
  'p2-k-android-manual-acceptance': 'ANDROID_K4_MANUAL'
})

const EXTERNAL_CATEGORY = Object.freeze({
  'p2-k-j7b-real-provider': 'J7B_REAL_PROVIDER',
  'p2-k-j10-real-visual': 'J10_REAL_VISUAL',
  'p2-k-windows-low-end-trace': 'WINDOWS_LOW_END_TRACE'
})

function parseArgs(args = process.argv.slice(2)) {
  const values = new Map()
  const repeated = new Map()
  for (let i = 0; i < args.length; i += 1) {
    const token = args[i]
    if (!token.startsWith('--')) continue
    const split = token.indexOf('=')
    let key
    let value
    if (split >= 0) {
      key = token.slice(2, split)
      value = token.slice(split + 1)
    } else {
      key = token.slice(2)
      const next = args[i + 1]
      if (next && !next.startsWith('--')) {
        value = next
        i += 1
      } else value = 'true'
    }
    values.set(key, value)
    const rows = repeated.get(key) ?? []
    rows.push(value)
    repeated.set(key, rows)
  }
  return { values, repeated }
}

function option(parsed, key, fallback = undefined) {
  return parsed.values.has(key) ? parsed.values.get(key) : fallback
}

function repeated(parsed, key) {
  return parsed.repeated.get(key) ?? []
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''))
}

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
}

function sha256Text(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex')
}

function safeRelative(value) {
  const normalized = String(value ?? '').replaceAll('\\', '/')
  if (
    !normalized ||
    normalized.startsWith('/') ||
    /^[A-Za-z]:\//.test(normalized) ||
    normalized.split('/').includes('..')
  )
    throw new Error(`unsafe evidence path: ${value}`)
  return normalized
}

function filesRecursively(root) {
  const out = []
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const target = path.join(root, entry.name)
    if (entry.isDirectory()) out.push(...filesRecursively(target))
    else out.push(target)
  }
  return out
}

function digestRows(rows) {
  return sha256Text(
    rows
      .map((row) => `${row.path}\t${row.bytes}\t${row.sha256}`)
      .sort()
      .join('\n')
  )
}

function fileRows(root, files = filesRecursively(root)) {
  return files
    .map((file) => ({
      path: path.relative(root, file).replaceAll(path.sep, '/'),
      bytes: fs.statSync(file).size,
      sha256: sha256File(file)
    }))
    .sort((a, b) => a.path.localeCompare(b.path))
}

function commitValid(value) {
  return /^[0-9a-f]{40}$/i.test(String(value ?? ''))
}

function runSuccessful(run) {
  return Number(run?.exitCode) === 0 && run?.outputExists === true
}

function platformSummary(environment) {
  if (!environment || typeof environment !== 'object') return null
  if (environment.platform === 'android')
    return {
      platform: 'android',
      model: environment.device?.model ?? null,
      api: environment.device?.api ?? null,
      abi: environment.device?.abi ?? null,
      deviceIdentitySha256: environment.device?.serialSha256 ?? null
    }
  if (environment.device?.serialSha256)
    return {
      platform: 'android',
      model: environment.device?.model ?? null,
      api: environment.device?.api ?? null,
      abi: environment.device?.abi ?? null,
      deviceIdentitySha256: environment.device?.serialSha256 ?? null
    }
  return {
    platform:
      environment.platform?.type ??
      environment.platform ??
      environment.os?.caption ??
      null,
    architecture:
      environment.architecture ??
      environment.platform?.arch ??
      null,
    machine:
      environment.computer?.model ??
      environment.hardware?.cpuModel ??
      null
  }
}

function validateManifestRoot(root) {
  const manifestFile = path.join(root, 'p2k-evidence-manifest.json')
  const manifest = readJson(manifestFile)
  const errors = []
  const type = String(manifest.evidenceType ?? '')
  const baseCategory = MANIFEST_CATEGORY[type]
  if (!baseCategory) errors.push(`unsupported manifest evidenceType: ${type}`)
  if (!commitValid(manifest.commit)) errors.push('manifest commit is invalid')
  if (manifest.complete !== true) errors.push('manifest is not complete')
  if (manifest.dirty === true) errors.push('dirty evidence cannot be promotion authority')
  if (manifest.budgetSelected !== false)
    errors.push('manifest must not preselect a performance budget')
  if (manifest.concurrencyCapacitySelected !== false)
    errors.push('manifest must not preselect concurrency capacity')

  const indexed = Array.isArray(manifest.files) ? manifest.files : []
  if (indexed.length === 0) errors.push('manifest has no indexed files')
  for (const row of indexed) {
    let relative
    try {
      relative = safeRelative(row.path)
    } catch (error) {
      errors.push(error.message)
      continue
    }
    const file = path.join(root, relative)
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
      errors.push(`indexed evidence file is missing: ${relative}`)
      continue
    }
    const bytes = fs.statSync(file).size
    const digest = sha256File(file)
    if (Number(row.bytes) !== bytes)
      errors.push(`indexed evidence byte count mismatch: ${relative}`)
    if (String(row.sha256 ?? '').toLowerCase() !== digest)
      errors.push(`indexed evidence SHA-256 mismatch: ${relative}`)
  }

  const categories = baseCategory ? [baseCategory] : []
  const visual = (manifest.runStatus?.runs ?? []).find(
    (row) => row?.id === 'J10_VISUAL_REAL_MODEL'
  )
  if (type === 'p2-k-windows-x64-reference' && runSuccessful(visual))
    categories.push('J10_REAL_VISUAL')

  const rows = indexed.map((row) => ({
    path: String(row.path),
    bytes: Number(row.bytes),
    sha256: String(row.sha256)
  }))
  return {
    sourceKind: 'p2k-manifest-root',
    source: root,
    evidenceType: type,
    commit: String(manifest.commit ?? ''),
    dirty: manifest.dirty === true,
    valid: errors.length === 0,
    errors,
    categories,
    bundleDigestSha256: rows.length ? digestRows(rows) : null,
    environment: platformSummary(manifest.environment),
    runIds: (manifest.runStatus?.runs ?? []).map((row) => row?.id).filter(Boolean)
  }
}

function validateK3Root(root) {
  const sessionFile = path.join(root, 'session.json')
  const session = readJson(sessionFile)
  const errors = []
  if (session.evidenceType !== 'p2-k-android-real-load-k3')
    errors.push('K3 session evidenceType is invalid')
  if (!commitValid(session.commit)) errors.push('K3 session commit is invalid')
  if (session.dirty === true) errors.push('dirty K3 evidence cannot be promotion authority')
  if (session.physicalDeviceRequired !== true || session.emulatorAccepted !== false)
    errors.push('K3 session must require a physical non-emulator device')
  if (!/^[0-9a-f]{64}$/i.test(String(session.device?.serialSha256 ?? '')))
    errors.push('K3 session requires a hashed device identity')
  if (session.syntheticMediaAccepted !== false)
    errors.push('K3 promotion evidence must reject synthetic media')
  if (session.rawIdsPersisted !== false)
    errors.push('K3 evidence must not persist raw comic/chapter identifiers')
  if (Number(session.exitCode) !== 0) errors.push('K3 benchmark did not exit successfully')
  if (session.budgetSelected !== false || session.concurrencyCapacitySelected !== false)
    errors.push('K3 evidence must not preselect budgets/capacities')

  const scenario = String(session.scenario ?? '')
  const categories = []
  if (scenario === 'real-download-loaded-navigation')
    categories.push('ANDROID_K3_DOWNLOAD')
  else if (scenario === 'real-reader-under-download') {
    categories.push('ANDROID_K3_READER')
    if (!/^[0-9a-f]{64}$/i.test(String(session.realInput?.comicIdSha256 ?? '')))
      errors.push('K3 Reader evidence requires hashed comic identity')
    if (!/^[0-9a-f]{64}$/i.test(String(session.realInput?.episodeIdSha256 ?? '')))
      errors.push('K3 Reader evidence requires hashed chapter identity')
  } else errors.push(`unsupported K3 scenario: ${scenario}`)

  const benchmarkFiles = filesRecursively(root).filter((file) =>
    file.endsWith('benchmarkData.json')
  )
  if (benchmarkFiles.length === 0) errors.push('K3 root has no benchmarkData JSON')

  const rows = fileRows(root)
  return {
    sourceKind: 'p2k-k3-root',
    source: root,
    evidenceType: String(session.evidenceType ?? ''),
    commit: String(session.commit ?? ''),
    dirty: session.dirty === true,
    valid: errors.length === 0,
    errors,
    categories,
    bundleDigestSha256: digestRows(rows),
    environment: {
      platform: 'android',
      model: session.device?.model ?? null,
      api: session.device?.api ?? null,
      abi: session.device?.abi ?? null,
      deviceIdentitySha256: session.device?.serialSha256 ?? null
    },
    scenario
  }
}

function validateExternalSidecar(file) {
  const metadata = readJson(file)
  const errors = []
  const type = String(metadata.evidenceType ?? '')
  const category = EXTERNAL_CATEGORY[type]
  if (!category) errors.push(`unsupported external evidenceType: ${type}`)
  if (!commitValid(metadata.commit)) errors.push('external evidence commit is invalid')
  if (metadata.complete !== true) errors.push('external evidence is not complete')
  if (metadata.dirty === true) errors.push('dirty external evidence cannot be promotion authority')
  if (metadata.budgetSelected !== false || metadata.concurrencyCapacitySelected !== false)
    errors.push('external evidence must not preselect budgets/capacities')

  const base = path.dirname(file)
  const artifacts = Array.isArray(metadata.artifacts) ? metadata.artifacts : []
  if (artifacts.length === 0) errors.push('external evidence sidecar has no artifacts')
  const rows = []
  for (const artifact of artifacts) {
    let relative
    try {
      relative = safeRelative(artifact.path)
    } catch (error) {
      errors.push(error.message)
      continue
    }
    const target = path.join(base, relative)
    if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
      errors.push(`external artifact is missing: ${relative}`)
      continue
    }
    const bytes = fs.statSync(target).size
    const digest = sha256File(target)
    if (artifact.bytes != null && Number(artifact.bytes) !== bytes)
      errors.push(`external artifact byte count mismatch: ${relative}`)
    if (String(artifact.sha256 ?? '').toLowerCase() !== digest)
      errors.push(`external artifact SHA-256 mismatch: ${relative}`)
    rows.push({ path: relative, bytes, sha256: digest })
  }

  return {
    sourceKind: 'p2k-external-sidecar',
    source: file,
    evidenceType: type,
    commit: String(metadata.commit ?? ''),
    dirty: metadata.dirty === true,
    valid: errors.length === 0,
    errors,
    categories: category ? [category] : [],
    bundleDigestSha256: rows.length ? digestRows(rows) : null,
    environment: platformSummary(metadata.environment)
  }
}

function reviewInputRoot(value) {
  const root = path.resolve(value)
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory())
    return {
      sourceKind: 'unknown',
      source: root,
      evidenceType: null,
      commit: '',
      dirty: false,
      valid: false,
      errors: ['evidence root does not exist or is not a directory'],
      categories: [],
      bundleDigestSha256: null,
      environment: null
    }
  try {
    if (fs.existsSync(path.join(root, 'p2k-evidence-manifest.json')))
      return validateManifestRoot(root)
    if (fs.existsSync(path.join(root, 'session.json'))) return validateK3Root(root)
    return {
      sourceKind: 'unknown',
      source: root,
      evidenceType: null,
      commit: '',
      dirty: false,
      valid: false,
      errors: ['root has neither p2k-evidence-manifest.json nor K3 session.json'],
      categories: [],
      bundleDigestSha256: null,
      environment: null
    }
  } catch (error) {
    return {
      sourceKind: 'unknown',
      source: root,
      evidenceType: null,
      commit: '',
      dirty: false,
      valid: false,
      errors: [error instanceof Error ? error.message : String(error)],
      categories: [],
      bundleDigestSha256: null,
      environment: null
    }
  }
}

function reviewExternal(value) {
  const file = path.resolve(value)
  if (!fs.existsSync(file) || !fs.statSync(file).isFile())
    return {
      sourceKind: 'p2k-external-sidecar',
      source: file,
      evidenceType: null,
      commit: '',
      dirty: false,
      valid: false,
      errors: ['external evidence sidecar does not exist or is not a file'],
      categories: [],
      bundleDigestSha256: null,
      environment: null
    }
  try {
    return validateExternalSidecar(file)
  } catch (error) {
    return {
      sourceKind: 'p2k-external-sidecar',
      source: file,
      evidenceType: null,
      commit: '',
      dirty: false,
      valid: false,
      errors: [error instanceof Error ? error.message : String(error)],
      categories: [],
      bundleDigestSha256: null,
      environment: null
    }
  }
}

const parsed = parseArgs()
const roots = repeated(parsed, 'root')
const external = repeated(parsed, 'external')
if (roots.length + external.length === 0) {
  console.error(
    'Usage: review-p2k-evidence.mjs --root=<K1/K2/K3/K4 evidence root> [--root=...] [--external=<sidecar.json>] [--target-commit=<sha>] [--output=<report.json>] [--require-complete]'
  )
  process.exit(2)
}

const inputs = [
  ...roots.map(reviewInputRoot),
  ...external.map(reviewExternal)
]

const blockers = []
for (const input of inputs) {
  if (!input.valid)
    blockers.push({
      code: 'INVALID_EVIDENCE_INPUT',
      source: input.source,
      details: input.errors
    })
}

const targetCommit = String(option(parsed, 'target-commit', '')).trim()
if (targetCommit && !commitValid(targetCommit)) {
  console.error('--target-commit must be a 40-character git SHA')
  process.exit(2)
}
const validCommits = [
  ...new Set(inputs.filter((input) => input.valid).map((input) => input.commit))
]
if (validCommits.length > 1)
  blockers.push({
    code: 'EVIDENCE_COMMIT_MISMATCH',
    commits: validCommits
  })
if (
  targetCommit &&
  inputs.some((input) => input.valid && input.commit !== targetCommit)
)
  blockers.push({
    code: 'TARGET_COMMIT_MISMATCH',
    targetCommit,
    commits: validCommits
  })

const matrix = {}
for (const category of REQUIRED_CATEGORIES) {
  const matches = inputs.filter((input) => input.categories.includes(category))
  const valid = matches.filter((input) => input.valid)
  matrix[category] = {
    presentCount: matches.length,
    validCount: valid.length,
    sources: valid.map((input) => input.source)
  }
  if (valid.length === 0)
    blockers.push({
      code: 'MISSING_REQUIRED_EVIDENCE',
      category
    })
}

const report = {
  schemaVersion: 1,
  reviewType: 'p2-k-evidence-review-k5',
  generatedAt: new Date().toISOString(),
  targetCommit: targetCommit || (validCommits.length === 1 ? validCommits[0] : null),
  decisionStatus:
    blockers.length === 0
      ? 'READY_FOR_HUMAN_VARIANCE_AND_BUDGET_REVIEW'
      : 'EVIDENCE_INCOMPLETE',
  structuralEvidenceComplete: blockers.length === 0,
  humanVarianceReviewRequired: true,
  minimumRepetitionCountSelected: false,
  budgetSelected: false,
  concurrencyCapacitySelected: false,
  requiredCategories: REQUIRED_CATEGORIES,
  matrix,
  repetitionInventory: {
    windowsReferenceBundles: matrix.WINDOWS_K1_REFERENCE.validCount,
    androidG18G19Bundles: matrix.ANDROID_K2_G18_G19.validCount,
    androidRealDownloadRuns: matrix.ANDROID_K3_DOWNLOAD.validCount,
    androidRealReaderRuns: matrix.ANDROID_K3_READER.validCount
  },
  blockers,
  inputs,
  warning:
    'K5 verifies evidence authority, completeness, commit coherence and bundle integrity. It does not choose performance thresholds, decide sufficient repetition count, or authorize P2-C3 enforcement.'
}

const output = path.resolve(
  option(parsed, 'output', 'test-results/p2k/review/p2k-evidence-review.json')
)
fs.mkdirSync(path.dirname(output), { recursive: true })
fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n', 'utf8')
process.stdout.write(JSON.stringify(report, null, 2) + '\n')

if (option(parsed, 'require-complete') === 'true' && !report.structuralEvidenceComplete)
  process.exitCode = 2
