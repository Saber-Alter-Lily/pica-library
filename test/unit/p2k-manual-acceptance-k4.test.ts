import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { afterEach, describe, expect, it } from 'vitest'

const read=(p:string)=>fs.readFileSync(p,'utf8')
const roots:string[]=[]
afterEach(()=>{
  for(const root of roots.splice(0)) fs.rmSync(root,{recursive:true,force:true})
})

function manualFixture(type:string,required:string[],present:string[],environmentPatch:Record<string,unknown>={}){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'p2k-k4-fixture-'))
  roots.push(root)
  const commit='9'.repeat(40)
  const environment={
    schemaVersion:1,evidenceType:type,commit,dirty:false,
    manualAcceptance:true,humanJudgmentRequired:true,
    budgetSelected:false,concurrencyCapacitySelected:false,
    ...environmentPatch
  }
  const runs=present.map(id=>{
    const output=`scenarios/${id}.json`
    fs.mkdirSync(path.join(root,'scenarios'),{recursive:true})
    fs.writeFileSync(path.join(root,output),JSON.stringify({schemaVersion:1,evidenceType:type,result:'PASS'}))
    return {id,output,outputExists:true,exitCode:0}
  })
  fs.writeFileSync(path.join(root,'environment.json'),JSON.stringify(environment))
  fs.writeFileSync(path.join(root,'run-status.json'),JSON.stringify({
    schemaVersion:1,evidenceType:type,commit,dirty:false,requiredScenarioIds:required,runs
  }))
  const result=spawnSync(process.execPath,[
    'scripts/benchmark/build-p2k-evidence-manifest.mjs',
    `--root=${root}`,`--commit=${commit}`,`--evidence-type=${type}`
  ],{encoding:'utf8'})
  return {root,commit,result}
}

describe('P2-K4 manual acceptance evidence tooling',()=>{
  it('uses explicit scenario semantics without adding a Gherkin dependency',()=>{
    const script=read('scripts/benchmark/p2k-manual-acceptance.mjs')
    const doc=read('docs/P2K_MANUAL_ACCEPTANCE_K4.md')
    expect(script).toContain("id: 'WINDOWS_LONG_TASK_VISIBLE'")
    expect(script).toContain("id: 'ANDROID_BACKGROUND_OEM'")
    expect(script).toContain('given:')
    expect(script).toContain('when:')
    expect(script).toContain('then:')
    expect(doc).toContain('Cucumber/Gherkin')
    const pkg=JSON.parse(read('package.json'))
    expect(pkg.dependencies?.['@cucumber/gherkin']).toBeUndefined()
    expect(pkg.devDependencies?.['@cucumber/gherkin']).toBeUndefined()
  })

  it('requires evidence attachments for PASS and hashes copied artifacts',()=>{
    const script=read('scripts/benchmark/p2k-manual-acceptance.mjs')
    expect(script).toContain('K4 PASS requires at least one --artifact')
    expect(script).toContain('sha256File(target)')
    expect(script).toContain('100 * 1024 * 1024')
    expect(script).toContain('Do not place credentials')
  })

  it('binds manual evidence to clean commit and physical/native platforms',()=>{
    const script=read('scripts/benchmark/p2k-manual-acceptance.mjs')
    expect(script).toContain('Working tree is dirty')
    expect(script).toContain("process.platform !== 'win32'")
    expect(script).toContain('K4 refuses emulator/generic-device evidence')
    expect(script).toContain('serialSha256')
    expect(script).toContain('physicalDeviceRequired: true')
  })

  it('makes direct-manifest bypasses retain platform and human authority',()=>{
    const manifest=read('scripts/benchmark/build-p2k-evidence-manifest.mjs')
    expect(manifest).toContain('manualAcceptanceEvidenceTypes')
    expect(manifest).toContain('environment.manualAcceptance !== true')
    expect(manifest).toContain('environment.humanJudgmentRequired !== true')
    expect(manifest).toContain('environment.nativeWindowsRequired !== true')
    expect(manifest).toContain('androidPhysicalEvidenceTypes.has(evidenceType)')
  })

  it('makes manifest completeness depend on every required manual scenario',()=>{
    const manifest=read('scripts/benchmark/build-p2k-evidence-manifest.mjs')
    for(const id of [
      'WINDOWS_LONG_TASK_VISIBLE',
      'WINDOWS_PAUSE_RESUME',
      'WINDOWS_CANCEL',
      'WINDOWS_FOREGROUND_USABILITY',
      'ANDROID_TASK_CENTER_VISIBILITY',
      'ANDROID_FOREGROUND_NOTIFICATION',
      'ANDROID_PAUSE_RESUME_CANCEL',
      'ANDROID_BACKGROUND_OEM',
      'ANDROID_FOREGROUND_USABILITY'
    ]) expect(manifest).toContain(id)
    expect(manifest).toContain('p2-k-windows-manual-acceptance')
    expect(manifest).toContain('p2-k-android-manual-acceptance')
  })

  it('keeps a partial Windows manual session incomplete even when every recorded row passed',()=>{
    const required=[
      'WINDOWS_LONG_TASK_VISIBLE',
      'WINDOWS_PAUSE_RESUME',
      'WINDOWS_CANCEL',
      'WINDOWS_FOREGROUND_USABILITY'
    ]
    const fixture=manualFixture(
      'p2-k-windows-manual-acceptance',
      required,
      required.slice(0,3),
      {nativeWindowsRequired:true}
    )
    expect(fixture.result.status).toBe(0)
    const manifest=JSON.parse(read(path.join(fixture.root,'p2k-evidence-manifest.json')))
    expect(manifest.complete).toBe(false)
  })

  it('builds a complete Windows manual manifest only when all required rows passed',()=>{
    const required=[
      'WINDOWS_LONG_TASK_VISIBLE',
      'WINDOWS_PAUSE_RESUME',
      'WINDOWS_CANCEL',
      'WINDOWS_FOREGROUND_USABILITY'
    ]
    const fixture=manualFixture(
      'p2-k-windows-manual-acceptance',
      required,
      required,
      {nativeWindowsRequired:true}
    )
    expect(fixture.result.status).toBe(0)
    const manifest=JSON.parse(read(path.join(fixture.root,'p2k-evidence-manifest.json')))
    expect(manifest.complete).toBe(true)
    expect(manifest.budgetSelected).toBe(false)
    expect(manifest.concurrencyCapacitySelected).toBe(false)
  })

  it('rejects manually assembled Windows evidence without native authority',()=>{
    const required=[
      'WINDOWS_LONG_TASK_VISIBLE',
      'WINDOWS_PAUSE_RESUME',
      'WINDOWS_CANCEL',
      'WINDOWS_FOREGROUND_USABILITY'
    ]
    const fixture=manualFixture(
      'p2-k-windows-manual-acceptance',
      required,
      required
    )
    expect(fixture.result.status).not.toBe(0)
    expect(fixture.result.stderr).toContain('native-Windows authority')
  })

  it('rejects manually assembled Android evidence without physical-device authority',()=>{
    const required=[
      'ANDROID_TASK_CENTER_VISIBILITY',
      'ANDROID_FOREGROUND_NOTIFICATION',
      'ANDROID_PAUSE_RESUME_CANCEL',
      'ANDROID_BACKGROUND_OEM',
      'ANDROID_FOREGROUND_USABILITY'
    ]
    const fixture=manualFixture(
      'p2-k-android-manual-acceptance',
      required,
      required
    )
    expect(fixture.result.status).not.toBe(0)
    expect(fixture.result.stderr).toContain('physical-device-only policy')
  })

  it('keeps budget and concurrency selection explicitly out of K4',()=>{
    const script=read('scripts/benchmark/p2k-manual-acceptance.mjs')
    expect(script).toContain('budgetSelected: false')
    expect(script).toContain('concurrencyCapacitySelected: false')
  })
})
