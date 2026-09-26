import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

const read=(p:string)=>fs.readFileSync(p,'utf8')

describe('P2-K3 Android real download/Reader physical evidence kit',()=>{
  it('keeps real-load Macrobenchmark opt-in and resource-verified',()=>{
    const b=read('mobile/android-alpha2/macrobenchmark/src/main/java/com/picalibrary/android/macrobenchmark/PicaRealLoadMacrobenchmark.java')
    expect(b).toContain('picaK3DownloadLoaded')
    expect(b).toContain('picaK3ReaderLoaded')
    expect(b).toContain('media-network')
    expect(b).toContain('filesystem-heavy')
    expect(b).toContain('realDownloadOverlapTopLevelFrameTiming')
    expect(b).toContain('realReaderUnderDownloadFrameTiming')
  })
  it('uses a benchmark-only bridge rather than exporting ReaderActivity',()=>{
    const m=read('mobile/android-alpha2/app/src/benchmark/AndroidManifest.xml')
    const bridge=read('mobile/android-alpha2/app/src/benchmark/java/com/picalibrary/android/BenchmarkReaderLaunchActivity.java')
    const release=read('mobile/android-alpha2/app/src/main/AndroidManifest.xml')
    expect(m).toContain('BenchmarkReaderLaunchActivity')
    expect(bridge).toContain('new Intent(this,ReaderActivity.class)')
    expect(release).not.toContain('BenchmarkReaderLaunchActivity')
  })
  it('requires explicit real identifiers and hashes them in evidence',()=>{
    const s=read('scripts/run-android-real-load-macrobenchmark.sh')
    expect(s).toContain('reader-loaded requires --comic-id and --episode-id')
    expect(s).toContain('comicIdSha256')
    expect(s).toContain('episodeIdSha256')
    expect(s).toContain('rawIdsPersisted:false')
    expect(s).toContain('syntheticMediaAccepted:false')
  })
  it('rejects emulator and dirty-tree promotion by default',()=>{
    const s=read('scripts/run-android-real-load-macrobenchmark.sh')
    expect(s).toContain('K3 refuses emulator/generic-device evidence')
    expect(s).toContain('Working tree is dirty')
    expect(s).toContain('physicalDeviceRequired:true')
    expect(s).toContain('emulatorAccepted:false')
    expect(s).toContain('P2K_COMMIT')
  })
  it('captures Reader meminfo without inventing a budget',()=>{
    const s=read('scripts/run-android-real-load-macrobenchmark.sh')
    const d=read('docs/P2K_ANDROID_REAL_LOAD_K3.md')
    expect(s).toContain('meminfo-before.txt')
    expect(s).toContain('meminfo-after.txt')
    expect(d).toContain('not a memory budget')
    expect(d).toContain('AndroidX')
    expect(d).toContain('Macrobenchmark 1.5.0')
  })
  it('preserves independent real-load runs and only copies current benchmark artifacts',()=>{
    const s=read('scripts/run-android-real-load-macrobenchmark.sh')
    expect(s).toContain('--result-dir=')
    expect(s).toContain('test-results/p2k/android-real-load-k3/')
    expect(s).toContain('result directory already exists and is not empty')
    expect(s).toContain('-newer "$artifact_marker"')
    expect(s).not.toContain('-mmin -90')
  })
})
