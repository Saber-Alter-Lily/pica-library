import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('Android side-by-side Dev package contract', () => {
  it('keeps the formal app identity while isolating the debug QA app', () => {
    const gradle = fs.readFileSync('mobile/android-alpha2/app/build.gradle', 'utf8')
    const manifest = fs.readFileSync('mobile/android-alpha2/app/src/main/AndroidManifest.xml', 'utf8')
    const app = fs.readFileSync('mobile/android-alpha2/app/src/main/java/com/picalibrary/android/PicaLibraryApp.java', 'utf8')

    expect(gradle).toContain("applicationId 'com.picalibrary.android'")
    expect(gradle).toContain("applicationIdSuffix '.dev'")
    expect(gradle).toContain("appLabel  : 'Pica Library Dev'")
    expect(gradle).toContain("appLabel  : 'Pica Library'")
    expect(gradle).toContain("versionNameSuffix '-dev-pr35'")
    expect(manifest).toContain('android:label="${appLabel}"')
    expect(manifest).toContain('android:authorities="${applicationId}.files"')
    expect(app).toContain('ApplicationInfo.FLAG_DEBUGGABLE')
    expect(app).toContain('if(!debuggable)UpdateCheckJobs.schedule(this);')
  })

  it('does not add a public-repository signing workflow for the Dev package', () => {
    expect(fs.existsSync('.github/workflows/pr35-dev-apk.yml')).toBe(false)
  })
})
