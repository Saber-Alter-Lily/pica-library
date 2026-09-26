import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

const read=(p:string)=>fs.readFileSync(p,'utf8')

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

  it('keeps budget and concurrency selection explicitly out of K4',()=>{
    const script=read('scripts/benchmark/p2k-manual-acceptance.mjs')
    expect(script).toContain('budgetSelected: false')
    expect(script).toContain('concurrencyCapacitySelected: false')
  })
})
