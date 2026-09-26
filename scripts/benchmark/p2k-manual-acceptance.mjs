#!/usr/bin/env node
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const SCENARIOS = Object.freeze({
  windows: [
    {
      id: 'WINDOWS_LONG_TASK_VISIBLE',
      title: 'Long work remains visible',
      given: 'Start one real long-running task such as download, recommendation, WebDAV sync or Visual indexing.',
      when: 'Navigate away from the initiating surface and return to task/status UI.',
      then: [
        'The task is still discoverable with a coherent state.',
        'Progress or phase does not falsely report completion.',
        'Existing usable data remains available while work continues.'
      ]
    },
    {
      id: 'WINDOWS_PAUSE_RESUME',
      title: 'Pause and resume are coherent',
      given: 'A real long-running task is visibly active.',
      when: 'Pause the task, verify the paused/pause-pending state, then resume it.',
      then: [
        'Pause does not silently discard accepted data.',
        'Resume follows the documented continuation/restart semantics.',
        'The task never jumps to a false completed state.'
      ]
    },
    {
      id: 'WINDOWS_CANCEL',
      title: 'Cancel is durable and honest',
      given: 'A real long-running task is visibly active.',
      when: 'Cancel the task from the supported task-control surface.',
      then: [
        'The task leaves the active state.',
        'The UI does not report successful completion for cancelled work.',
        'Previously accepted library/recommendation/download data remains coherent.'
      ]
    },
    {
      id: 'WINDOWS_FOREGROUND_USABILITY',
      title: 'Ordinary use remains responsive under long work',
      given: 'A real long-running task is active.',
      when: 'Use Library, open Detail, open Reader, return to Library and switch ordinary navigation surfaces.',
      then: [
        'The application remains interactive instead of appearing frozen.',
        'Usable data can still be viewed while background work proceeds.',
        'Task visibility/control remains available after foreground navigation.'
      ]
    }
  ],
  android: [
    {
      id: 'ANDROID_TASK_CENTER_VISIBILITY',
      title: 'Task Center reconstructs real work',
      given: 'Start a real long-running Android WorkManager task.',
      when: 'Open Task Center, leave it, return, and relaunch the app once while work remains active.',
      then: [
        'The real task is visible with a coherent state/progress.',
        'Task identity survives Activity recreation/relaunch.',
        'No stale historical WorkInfo is presented as the current task.'
      ]
    },
    {
      id: 'ANDROID_FOREGROUND_NOTIFICATION',
      title: 'Foreground notification matches task state',
      given: 'Run a real task that is eligible for foreground execution/notification.',
      when: 'Background the app and inspect the system notification while the task state changes.',
      then: [
        'Notification visibility and text do not contradict Task Center.',
        'Returning to the app reconstructs the same durable task state.',
        'No finished/cancelled task is left advertised as actively running.'
      ]
    },
    {
      id: 'ANDROID_PAUSE_RESUME_CANCEL',
      title: 'Task Center controls remain durable',
      given: 'Use a real download, recommendation, bootstrap or other supported controllable long task.',
      when: 'Exercise pause, resume and cancel using the user-facing Task Center controls.',
      then: [
        'Pause reaches the documented paused/pause-pending semantics.',
        'Resume continues or safely re-executes according to the documented task contract.',
        'Cancel is durable and never appears as success.'
      ]
    },
    {
      id: 'ANDROID_BACKGROUND_OEM',
      title: 'Background/OEM restriction state remains honest',
      given: 'A real long-running task is active on representative physical Android hardware.',
      when: 'Background/screen-off the app and exercise the device OEM battery/background restriction path applicable to that device, then return/relaunch.',
      then: [
        'The app does not invent completion while the OS defers or interrupts work.',
        'Task Center recovers a coherent running/paused/queued/failed/cancelled state.',
        'Foreground notification and durable WorkManager state do not contradict each other.'
      ]
    },
    {
      id: 'ANDROID_FOREGROUND_USABILITY',
      title: 'Foreground UI remains usable during real load',
      given: 'A real recommendation/download loaded scenario is running on the physical device.',
      when: 'Use Library, Detail, Reader and top-level navigation while the resource snapshot confirms real work.',
      then: [
        'Foreground UI remains interactive instead of appearing frozen.',
        'Reader and Library remain usable under representative background load.',
        'The long task remains observable after navigation.'
      ]
    }
  ]
})

function parseArgs(args = process.argv.slice(2)) {
  const command = args[0] || ''
  const values = new Map()
  const repeated = new Map()
  for (let index = 1; index < args.length; index += 1) {
    const token = args[index]
    if (!token.startsWith('--')) continue
    const split = token.indexOf('=')
    let key
    let value
    if (split >= 0) {
      key = token.slice(2, split)
      value = token.slice(split + 1)
    } else {
      key = token.slice(2)
      const next = args[index + 1]
      if (next && !next.startsWith('--')) {
        value = next
        index += 1
      } else value = 'true'
    }
    values.set(key, value)
    const rows = repeated.get(key) ?? []
    rows.push(value)
    repeated.set(key, rows)
  }
  return { command, values, repeated }
}

function option(parsed, key, fallback = undefined) {
  return parsed.values.has(key) ? parsed.values.get(key) : fallback
}

function repeated(parsed, key) {
  return parsed.repeated.get(key) ?? []
}

function run(command, args, { allowFailure = false } = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    windowsHide: true
  })
  if (!allowFailure && result.status !== 0)
    throw new Error(
      `${command} ${args.join(' ')} failed: ${String(result.stderr || result.stdout || '').trim()}`
    )
  return {
    status: result.status ?? -1,
    stdout: String(result.stdout || '').trim(),
    stderr: String(result.stderr || '').trim()
  }
}

function gitCommit() {
  const value = run('git', ['rev-parse', 'HEAD']).stdout
  if (!/^[0-9a-f]{40}$/i.test(value))
    throw new Error('Unable to resolve exact git commit')
  return value
}

function gitDirty() {
  return run('git', ['status', '--porcelain']).stdout.length > 0
}

function sha256Text(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex')
}

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
}

function timestampRoot(platform) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
  return path.resolve('test-results', 'p2k', 'manual-acceptance', platform, stamp)
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''))
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', 'utf8')
}

function evidenceType(platform) {
  if (platform === 'windows') return 'p2-k-windows-manual-acceptance'
  if (platform === 'android') return 'p2-k-android-manual-acceptance'
  throw new Error('--platform must be windows or android')
}

function androidEnvironment() {
  if (!process.env.ANDROID_SERIAL) {
    const rows = run('adb', ['devices']).stdout
      .split(/\r?\n/)
      .slice(1)
      .map((line) => line.trim().split(/\s+/))
      .filter((row) => row[0] && row[1] === 'device')
    if (rows.length !== 1)
      throw new Error('K4 Android init requires exactly one adb physical device unless ANDROID_SERIAL is set')
    process.env.ANDROID_SERIAL = rows[0][0]
  }
  run('adb', ['get-state'])
  const prop = (name) => run('adb', ['shell', 'getprop', name]).stdout.replace(/\r/g, '')
  const model = prop('ro.product.model')
  const qemu = prop('ro.kernel.qemu')
  if (
    qemu === '1' ||
    /emulator|generic|sdk.*gphone/i.test(model)
  )
    throw new Error(`K4 refuses emulator/generic-device evidence: model=${model} qemu=${qemu}`)
  const serial = run('adb', ['get-serialno']).stdout.replace(/\r/g, '')
  const packageName = 'com.picalibrary.android'
  const standby = run('adb', ['shell', 'am', 'get-standby-bucket', packageName], {
    allowFailure: true
  }).stdout
  const deviceIdle = run('adb', ['shell', 'dumpsys', 'deviceidle', 'whitelist'], {
    allowFailure: true
  }).stdout
  return {
    physicalDeviceRequired: true,
    emulatorAccepted: false,
    device: {
      serialSha256: sha256Text(serial),
      manufacturer: prop('ro.product.manufacturer'),
      model,
      api: Number(prop('ro.build.version.sdk') || 0),
      abi: prop('ro.product.cpu.abi'),
      socManufacturer: prop('ro.soc.manufacturer') || null,
      socModel: prop('ro.soc.model') || null,
      buildFingerprint: prop('ro.build.fingerprint'),
      memoryBytes: (() => {
        const value = run('adb', ['shell', 'cat', '/proc/meminfo'], {
          allowFailure: true
        }).stdout.match(/^MemTotal:\s*(\d+)/m)
        return value ? Number(value[1]) * 1024 : null
      })()
    },
    systemObservation: {
      appStandbyBucket: standby || null,
      deviceIdleWhitelistContainsApp: deviceIdle.includes(packageName)
    }
  }
}

function windowsEnvironment() {
  if (process.platform !== 'win32')
    throw new Error('K4 Windows manual acceptance must be initialized on native Windows')
  return {
    nativeWindowsRequired: true,
    platform: {
      type: os.type(),
      release: os.release(),
      version: os.version(),
      arch: os.arch()
    },
    hardware: {
      cpuModel: os.cpus()[0]?.model ?? null,
      logicalCpuCount: os.cpus().length,
      totalMemoryBytes: os.totalmem()
    },
    runtime: {
      node: process.version
    }
  }
}

function manifest(root, commit, type) {
  run(process.execPath, [
    path.resolve('scripts/benchmark/build-p2k-evidence-manifest.mjs'),
    `--root=${root}`,
    `--commit=${commit}`,
    `--evidence-type=${type}`
  ])
  return readJson(path.join(root, 'p2k-evidence-manifest.json'))
}

function verifyAuthority(root) {
  const envFile = path.join(root, 'environment.json')
  const statusFile = path.join(root, 'run-status.json')
  const scenariosFile = path.join(root, 'manual-scenarios.json')
  if (![envFile, statusFile, scenariosFile].every((file) => fs.existsSync(file)))
    throw new Error('K4 evidence root is missing environment/status/scenario authority files')
  const environment = readJson(envFile)
  const status = readJson(statusFile)
  const scenarios = readJson(scenariosFile)
  const commit = gitCommit()
  if (environment.commit !== commit || status.commit !== commit)
    throw new Error('K4 evidence session commit differs from the current checkout')
  if (environment.evidenceType !== status.evidenceType)
    throw new Error('K4 evidence type mismatch')
  return { environment, status, scenarios, commit }
}

function init(parsed) {
  const platform = option(parsed, 'platform')
  const type = evidenceType(platform)
  const dirty = gitDirty()
  if (dirty && option(parsed, 'allow-dirty') !== 'true')
    throw new Error('Working tree is dirty; commit/stash or pass --allow-dirty for diagnostic-only evidence')
  const commit = gitCommit()
  const root = path.resolve(option(parsed, 'root', timestampRoot(platform)))
  if (fs.existsSync(root) && fs.readdirSync(root).length)
    throw new Error('K4 evidence root already exists and is not empty')
  fs.mkdirSync(root, { recursive: true })

  const platformEnvironment =
    platform === 'android' ? androidEnvironment() : windowsEnvironment()
  const rows = SCENARIOS[platform]
  writeJson(path.join(root, 'environment.json'), {
    schemaVersion: 1,
    evidenceType: type,
    collectedAt: new Date().toISOString(),
    commit,
    dirty,
    platform,
    manualAcceptance: true,
    humanJudgmentRequired: true,
    budgetSelected: false,
    concurrencyCapacitySelected: false,
    ...platformEnvironment
  })
  writeJson(path.join(root, 'manual-scenarios.json'), {
    schemaVersion: 1,
    evidenceType: type,
    structureReference: 'Cucumber/Gherkin-style Given/When/Then scenario semantics; no runtime dependency',
    scenarios: rows
  })
  writeJson(path.join(root, 'run-status.json'), {
    schemaVersion: 1,
    evidenceType: type,
    commit,
    dirty,
    requiredScenarioIds: rows.map((row) => row.id),
    runs: []
  })
  manifest(root, commit, type)
  process.stdout.write(root + '\n')
}

function copyArtifacts(root, scenarioId, artifactArgs) {
  const output = []
  const targetRoot = path.join(root, 'artifacts', scenarioId)
  for (const raw of artifactArgs) {
    const source = path.resolve(raw)
    if (!fs.existsSync(source) || !fs.statSync(source).isFile())
      throw new Error(`K4 artifact is not a file: ${raw}`)
    const size = fs.statSync(source).size
    if (size > 100 * 1024 * 1024)
      throw new Error(`K4 artifact exceeds 100 MiB: ${raw}`)
    fs.mkdirSync(targetRoot, { recursive: true })
    const safe = path.basename(source).replace(/[^A-Za-z0-9._-]+/g, '_')
    let target = path.join(targetRoot, safe)
    if (fs.existsSync(target)) {
      const ext = path.extname(safe)
      const base = safe.slice(0, safe.length - ext.length)
      target = path.join(targetRoot, `${base}-${sha256File(source).slice(0, 10)}${ext}`)
    }
    fs.copyFileSync(source, target)
    output.push({
      path: path.relative(root, target).replaceAll(path.sep, '/'),
      bytes: size,
      sha256: sha256File(target)
    })
  }
  return output
}

function record(parsed) {
  const root = path.resolve(option(parsed, 'root', ''))
  if (!option(parsed, 'root')) throw new Error('--root is required')
  const scenarioId = String(option(parsed, 'scenario', '')).trim()
  const result = String(option(parsed, 'result', '')).toLowerCase()
  if (!['pass', 'fail'].includes(result))
    throw new Error('--result must be pass or fail')
  const authority = verifyAuthority(root)
  const scenario = authority.scenarios.scenarios.find((row) => row.id === scenarioId)
  if (!scenario) throw new Error(`Unknown K4 scenario: ${scenarioId}`)
  const artifacts = repeated(parsed, 'artifact')
  if (result === 'pass' && artifacts.length === 0)
    throw new Error('K4 PASS requires at least one --artifact screenshot/recording/log')
  const copied = copyArtifacts(root, scenarioId, artifacts)
  const notes = String(option(parsed, 'notes', '')).trim()
  const now = new Date().toISOString()
  const relativeOutput = `scenarios/${scenarioId}.json`
  writeJson(path.join(root, relativeOutput), {
    schemaVersion: 1,
    evidenceType: authority.environment.evidenceType,
    scenario,
    result: result.toUpperCase(),
    recordedAt: now,
    notes,
    artifacts: copied,
    warning: 'Do not place credentials, tokens, cookies, raw Android serials or other secrets in manual notes/artifacts.'
  })

  const status = authority.status
  status.runs = Array.isArray(status.runs) ? status.runs : []
  status.runs = status.runs.filter((row) => row.id !== scenarioId)
  status.runs.push({
    id: scenarioId,
    output: relativeOutput,
    outputExists: true,
    exitCode: result === 'pass' ? 0 : 1,
    manualResult: result.toUpperCase(),
    startedAt: now,
    finishedAt: now
  })
  writeJson(path.join(root, 'run-status.json'), status)
  manifest(root, authority.commit, authority.environment.evidenceType)
  process.stdout.write(`${scenarioId}: ${result.toUpperCase()}\n`)
}

function finalize(parsed) {
  const root = path.resolve(option(parsed, 'root', ''))
  if (!option(parsed, 'root')) throw new Error('--root is required')
  const authority = verifyAuthority(root)
  const required = authority.status.requiredScenarioIds ?? []
  const runs = new Map((authority.status.runs ?? []).map((row) => [row.id, row]))
  const missing = required.filter((id) => !runs.has(id))
  if (missing.length)
    throw new Error(`K4 finalize missing scenarios: ${missing.join(', ')}`)
  const result = manifest(root, authority.commit, authority.environment.evidenceType)
  process.stdout.write(
    JSON.stringify(
      {
        root,
        evidenceType: result.evidenceType,
        complete: result.complete,
        budgetSelected: result.budgetSelected,
        concurrencyCapacitySelected: result.concurrencyCapacitySelected
      },
      null,
      2
    ) + '\n'
  )
  if (!result.complete)
    throw new Error('K4 manual acceptance is fully recorded but at least one required scenario did not PASS')
}

const parsed = parseArgs()
try {
  if (parsed.command === 'init') init(parsed)
  else if (parsed.command === 'record') record(parsed)
  else if (parsed.command === 'finalize') finalize(parsed)
  else
    throw new Error(
      'Usage: p2k-manual-acceptance.mjs init|record|finalize --platform=windows|android --root=...'
    )
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
