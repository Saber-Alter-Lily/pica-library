import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

const hub = fs.readFileSync('web/alpha8-7-desktop-hub.js', 'utf8')

describe('Recommendation V4 settings hub', () => {
    it('keeps accounts in General and exposes a dedicated Recommendations section', () => {
        expect(hub).not.toContain("accounts: '账号与来源'")
        expect(hub).toContain("recommendations: '推荐与画风'")
        expect(hub).not.toContain("['accounts', 'accounts']")
        expect(hub).toContain("['recommendations', 'recommendations']")
    })

    it('moves E-H into General and visual controls into Recommendations before hiding legacy Settings', () => {
        expect(hub).toContain("const ehAccount = hub$('#settings-eh-account')")
        expect(hub).toContain("panels.get('general').appendChild(ehAccount)")
        expect(hub).toContain("const recommendationV4 = hub$('#settings-recommendation-v4')")
        expect(hub).toContain("panels.get('recommendations').appendChild(recommendationV4)")
        expect(hub).toContain('settings.hidden = true')
    })

    it('routes first-run provider actions to General and the E-H account panel', () => {
        expect(hub).toContain("openSettingsHubPanel('general')")
        expect(hub).toContain("const panel = hub$('#settings-eh-account')")
        expect(hub).toContain("panel.scrollIntoView")
    })
})
