import { describe, expect, it } from 'vitest'
import { ehSessionFromCdpCookies } from '../../src/desktop/eh-web-login'

describe('desktop controlled E-H web login', () => {
    it('extracts the official E-H cookie session and ignores unrelated cookies', () => {
        expect(
            ehSessionFromCdpCookies([
                { name: 'noise', value: 'x', domain: 'example.com' },
                { name: 'ipb_member_id', value: '123', domain: '.e-hentai.org' },
                { name: 'ipb_pass_hash', value: 'abc', domain: 'forums.e-hentai.org' },
                { name: 'igneous', value: 'igneous-value', domain: 'exhentai.org' },
                { name: 'cf_clearance', value: 'cf-value', domain: '.e-hentai.org' }
            ])
        ).toEqual({
            memberId: '123',
            passHash: 'abc',
            igneous: 'igneous-value',
            cfClearance: 'cf-value'
        })
    })

    it('does not promote an incomplete browser session', () => {
        expect(
            ehSessionFromCdpCookies([
                { name: 'ipb_member_id', value: '123', domain: '.e-hentai.org' }
            ])
        ).toBeNull()
    })
})
