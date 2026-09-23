import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import {
    ehSessionFromCdpCookies,
    managedEhBrowserArgs
} from '../../src/desktop/eh-web-login'

describe('desktop controlled E-H web login', () => {
    it('extracts stable E-H identity cookies and ignores browser-bound Cloudflare clearance', () => {
        expect(
            ehSessionFromCdpCookies([
                { name: 'noise', value: 'x', domain: 'example.com' },
                { name: 'ipb_member_id', value: '123', domain: '.e-hentai.org' },
                { name: 'ipb_pass_hash', value: 'abc', domain: 'forums.e-hentai.org' },
                { name: 'igneous', value: 'igneous-value', domain: 'exhentai.org' },
                { name: 'cf_clearance', value: 'x'.repeat(2048), domain: '.e-hentai.org' }
            ])
        ).toEqual({
            memberId: '123',
            passHash: 'abc',
            igneous: 'igneous-value'
        })
    })

    it('launches any discovered Chromium browser with an isolated loopback-only CDP profile', () => {
        expect(
            managedEhBrowserArgs('/tmp/pica-eh-login', 43123)
        ).toEqual([
            '--user-data-dir=/tmp/pica-eh-login',
            '--remote-debugging-port=43123',
            '--remote-debugging-address=127.0.0.1',
            '--no-first-run',
            '--no-default-browser-check',
            '--new-window',
            'https://forums.e-hentai.org/index.php?act=Login'
        ])
    })

    it('derives managed-login capability from runtime browser discovery instead of OS name', () => {
        const main = fs.readFileSync('src/desktop/main.ts', 'utf8')
        const login = fs.readFileSync(
            'src/desktop/eh-web-login.ts',
            'utf8'
        )
        expect(main).toContain(
            'const managedEhBrowser = findManagedBrowser()'
        )
        expect(main).toContain(
            'managedEhWebLogin: Boolean(managedEhBrowser)'
        )
        expect(main).toContain('managedEhBrowser')
        expect(login).not.toContain(
            "process.platform !== 'win32'"
        )
        expect(login).toContain('this.browser.executable')
        expect(login).toContain("await this.cdp.send('Browser.close')")
        expect(login).toContain("processHandle.kill('SIGTERM')")
    })

    it('does not promote an incomplete browser session', () => {
        expect(
            ehSessionFromCdpCookies([
                { name: 'ipb_member_id', value: '123', domain: '.e-hentai.org' }
            ])
        ).toBeNull()
    })
})
