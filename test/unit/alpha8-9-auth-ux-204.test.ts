import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { applicationFetchInternals } from '../../src/update/application-fetch'

describe('Alpha8.9 authenticated Star UX and HTTP 204 hotfix', () => {
    it('constructs GitHub successful 204 responses with a null body', () => {
        const body = applicationFetchInternals.responseBody(
            204,
            'GET',
            new ArrayBuffer(0)
        )
        expect(body).toBeNull()
        expect(() => new Response(body, { status: 204 })).not.toThrow()
        expect(
            applicationFetchInternals.responseBody(
                205,
                'GET',
                new ArrayBuffer(0)
            )
        ).toBeNull()
        expect(
            applicationFetchInternals.responseBody(
                304,
                'GET',
                new ArrayBuffer(0)
            )
        ).toBeNull()
        expect(
            applicationFetchInternals.responseBody(
                200,
                'HEAD',
                new ArrayBuffer(0)
            )
        ).toBeNull()
        expect(
            applicationFetchInternals.responseBody(
                200,
                'GET',
                new TextEncoder().encode('ok').buffer
            )
        ).not.toBeNull()
    })

    it('shows the Desktop device code before GitHub can be opened', () => {
        const source = fs.readFileSync('web/alpha8-star-access.js', 'utf8')
        expect(source).toContain('生成 GitHub 验证码')
        expect(source).toContain('box.hidden=false')
        expect(source).toContain('code.textContent=flow.userCode')
        expect(source).toContain('copy.onclick=async()=>')
        expect(source).toContain('open.onclick=async()=>')
        expect(source.match(/window\.open\(flow\.verificationUri/g)?.length).toBe(1)
    })

    it('keeps the Android code visible across the external-browser round trip', () => {
        const auth = fs.readFileSync(
            'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/GitHubAccountAuth.java',
            'utf8'
        )
        const activity = fs.readFileSync(
            'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/ThemePackActivity.java',
            'utf8'
        )
        expect(auth).not.toContain('app.startActivity(browser)')
        expect(activity).toContain('!authInProgress')
        expect(activity).toContain('复制验证码')
        expect(activity).toContain('Button open=Ui.button(this,"打开 GitHub"')
        expect(activity).toContain('copyCode(userCode)')
    })

    it('reserves Android system-bar insets on the disclaimer screen', () => {
        const source = fs.readFileSync(
            'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/DisclaimerActivity.java',
            'utf8'
        )
        expect(source).toContain('setOnApplyWindowInsetsListener')
        expect(source).toContain('getSystemWindowInsetTop()')
        expect(source).toContain('getSystemWindowInsetBottom()')
        expect(source).toContain('requestApplyInsets()')
    })
})
