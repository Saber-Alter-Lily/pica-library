import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

const hub = fs.readFileSync('web/alpha8-7-desktop-hub.js', 'utf8')

describe('Recommendation V4 settings hub', () => {
    it('exposes dedicated Accounts and Recommendations sections', () => {
        expect(hub).toContain("accounts: '账号与来源'")
        expect(hub).toContain("recommendations: '推荐与画风'")
        expect(hub).toContain("['accounts', 'accounts']")
        expect(hub).toContain("['recommendations', 'recommendations']")
    })

    it('moves E-H and visual controls out of the hidden legacy Settings container', () => {
        expect(hub).toContain("const ehAccount = hub$('#settings-eh-account')")
        expect(hub).toContain("panels.get('accounts').appendChild(ehAccount)")
        expect(hub).toContain("const recommendationV4 = hub$('#settings-recommendation-v4')")
        expect(hub).toContain("panels.get('recommendations').appendChild(recommendationV4)")
    })

    it('routes first-run provider actions into the visible settings hub', () => {
        expect(hub).toContain("openSettingsHubPanel('accounts')")
        expect(hub).toContain("openSettingsHubPanel('general')")
    })
})
