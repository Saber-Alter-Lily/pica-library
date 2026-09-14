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
    expect(app).toContain('if(!BuildConfig.DEBUG)UpdateCheckJobs.schedule(this);')
  })

  it('builds a signed CI artifact without publishing a release', () => {
    const workflow = fs.readFileSync('.github/workflows/pr35-dev-apk.yml', 'utf8')

    expect(workflow).toContain('Pica-Library-Dev-PR35.apk')
    expect(workflow).toContain("package: name='com.picalibrary.android.dev'")
    expect(workflow).toContain("application-label:'Pica Library Dev'")
    expect(workflow).toContain('actions/upload-artifact@v4')
    expect(workflow).not.toContain('softprops/action-gh-release')
    expect(workflow).not.toContain('gh release')
  })
})
