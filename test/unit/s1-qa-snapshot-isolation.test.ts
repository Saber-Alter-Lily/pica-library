import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = fileURLToPath(new URL('../../', import.meta.url))
const read = (name: string) => fs.readFileSync(path.join(root,name),'utf8')

describe('S1 disposable Android QA identities', () => {
    it('keeps the ordinary debug application identity unchanged unless an explicit QA suffix is set', () => {
        const gradle = read('mobile/android-alpha2/app/build.gradle')
        expect(gradle).toContain("def isolatedQaSuffix = System.getenv('PICA_ANDROID_QA_PACKAGE_SUFFIX') ?: ''")
        expect(gradle).toContain("def debugAppSuffix = isolatedQaSuffix ? isolatedQaSuffix : '.dev'")
        expect(gradle).toContain("applicationIdSuffix debugAppSuffix")
        expect(gradle).toContain('pairScheme: debugPairScheme')
        expect(gradle).toContain('appLabel  : debugAppLabel')
        expect(gradle).toMatch(/Invalid S1 QA application suffix/)
        expect(gradle).toContain("def debugPairScheme = isolatedQaSuffix ?")
    })
    it('requires a separate QA3 package, URL scheme and non-production build artifact', () => {
        const yml=read('.github/workflows/s1-android-dev-package.yml')
        expect(yml).toContain("PICA_ANDROID_QA_PACKAGE_SUFFIX: '.s1qa3'")
        expect(yml).toContain("name='com.picalibrary.android.s1qa3'")
        expect(yml).toContain("versionCode='92'")
        expect(yml).toContain("application-label:'Pica Library S1 QA3'")
        expect(yml).toContain('Pica-Library-S1-Android-QA3-v92.apk')
        expect(yml).toContain('github.event.repository.private == false')
        expect(yml).toContain('retention-days: 1')
        expect(yml).not.toMatch(/assembleRelease|secrets\.|gh release|git tag|contents: write/)
    })
    it('rejects external launcher ANR overlays instead of trusting painted pixels', () => {
        const java = read('mobile/android-alpha2/app/src/androidTest/java/com/picalibrary/android/S1AndroidLocaleMatrixTest.java')
        const workflow = read('.github/workflows/s1-android-locale-matrix.yml')
        const runner = read('scripts/run-s1-android-locale-matrix.sh')
        expect(java).toContain('getRootInActiveWindow()')
        expect(java).toContain('getWindow().getDecorView().hasWindowFocus()')
        expect(java).toContain('focused[0]&&ownPackage.equals(windowOwner)&&painted')
        expect(java).toContain('saveRejectedScreenshot(image,dir,page)')
        expect(java).toContain('"rejected-"+page+".png"')
        expect(workflow).toContain('target: aosp_atd')
        expect(runner).toContain('rejected-$page.png')
        expect(runner).toContain('mCurrentFocus|mFocusedApp')
    })

})
