import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { afterEach, describe, expect, it } from 'vitest'

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0))
    fs.rmSync(root, { recursive: true, force: true })
})

describe('P2-K K2 Android physical-device evidence kit', () => {
  it('stages G18 and G19 on one physical device/commit without synthetic load', () => {
    const script = fs.readFileSync('scripts/benchmark/run-p2k-android-physical.sh','utf8')
    expect(script).toContain('baseline|prepare-loaded|loaded|finalize')
    expect(script).toContain('bash scripts/run-android-macrobenchmark.sh')
    expect(script).toContain('bash scripts/run-android-loaded-macrobenchmark.sh prepare')
    expect(script).toContain('bash scripts/run-android-loaded-macrobenchmark.sh run')
    expect(script).toContain('K2 refuses emulator/generic-device evidence')
    expect(script).toContain('K2 evidence session commit mismatch')
    expect(script).toContain('K2 evidence session device mismatch')
    expect(script).not.toContain('synthetic recommendation')
  })

  it('redacts raw adb serial from copied evidence', () => {
    const script = fs.readFileSync('scripts/benchmark/run-p2k-android-physical.sh','utf8')
    expect(script).toContain('serialSha256')
    expect(script).toContain('delete v.serial')
    expect(script).toContain('P2K_SERIAL_HASH')
  })

  it('keeps K1 default evidence type while adding Android manifest support', () => {
    const builder = fs.readFileSync('scripts/benchmark/build-p2k-evidence-manifest.mjs','utf8')
    expect(builder).toContain("option('evidence-type')")
    expect(builder).toContain("'p2-k-windows-x64-reference'")
    expect(builder).toContain('p2-k-android-physical-reference')
  })

  it('keeps a baseline-only Android bundle incomplete until G19 is present', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(),'p2k-android-baseline-only-'))
    roots.push(root)
    const commit = 'd'.repeat(40)
    fs.mkdirSync(path.join(root,'g18-idle'))
    fs.writeFileSync(path.join(root,'g18-idle','result.json'),'{}')
    fs.writeFileSync(path.join(root,'environment.json'),JSON.stringify({
      schemaVersion:1,evidenceType:'p2-k-android-physical-reference',commit,dirty:false,
      device:{serialSha256:'e'.repeat(64)},physicalDeviceRequired:true,emulatorAccepted:false
    }))
    fs.writeFileSync(path.join(root,'run-status.json'),JSON.stringify({
      schemaVersion:1,evidenceType:'p2-k-android-physical-reference',commit,dirty:false,
      runs:[{id:'G18_IDLE',output:'g18-idle',outputExists:true,exitCode:0}]
    }))
    const result = spawnSync(process.execPath,[
      'scripts/benchmark/build-p2k-evidence-manifest.mjs',
      `--root=${root}`,`--commit=${commit}`,
      '--evidence-type=p2-k-android-physical-reference'
    ],{encoding:'utf8'})
    expect(result.status).toBe(0)
    const manifest=JSON.parse(fs.readFileSync(path.join(root,'p2k-evidence-manifest.json'),'utf8'))
    expect(manifest.complete).toBe(false)
  })

  it('builds a complete two-run Android physical manifest fixture', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(),'p2k-android-manifest-'))
    roots.push(root)
    const commit = 'b'.repeat(40)
    fs.mkdirSync(path.join(root,'g18-idle'))
    fs.mkdirSync(path.join(root,'g19-recommendation-loaded'))
    fs.writeFileSync(path.join(root,'g18-idle','result.json'),'{}')
    fs.writeFileSync(path.join(root,'g19-recommendation-loaded','result.json'),'{}')
    fs.writeFileSync(path.join(root,'environment.json'),JSON.stringify({
      schemaVersion:1,evidenceType:'p2-k-android-physical-reference',commit,dirty:false,
      device:{serialSha256:'c'.repeat(64)},physicalDeviceRequired:true,emulatorAccepted:false
    }))
    fs.writeFileSync(path.join(root,'run-status.json'),JSON.stringify({
      schemaVersion:1,evidenceType:'p2-k-android-physical-reference',commit,dirty:false,
      runs:[
        {id:'G18_IDLE',output:'g18-idle',outputExists:true,exitCode:0},
        {id:'G19_RECOMMENDATION_LOADED',output:'g19-recommendation-loaded',outputExists:true,exitCode:0}
      ]
    }))
    const result = spawnSync(process.execPath,[
      'scripts/benchmark/build-p2k-evidence-manifest.mjs',
      `--root=${root}`,`--commit=${commit}`,
      '--evidence-type=p2-k-android-physical-reference'
    ],{encoding:'utf8'})
    expect(result.status).toBe(0)
    const manifest=JSON.parse(fs.readFileSync(path.join(root,'p2k-evidence-manifest.json'),'utf8'))
    expect(manifest.evidenceType).toBe('p2-k-android-physical-reference')
    expect(manifest.complete).toBe(true)
    expect(manifest.budgetSelected).toBe(false)
    expect(manifest.concurrencyCapacitySelected).toBe(false)
    expect(manifest.externalEvidenceStillRequired).toEqual(expect.arrayContaining([
      expect.stringContaining('real download'),
      expect.stringContaining('Reader')
    ]))
  })
})
