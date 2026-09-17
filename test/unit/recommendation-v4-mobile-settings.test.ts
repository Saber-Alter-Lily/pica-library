import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => fs.readFileSync(path, 'utf8')

describe('Recommendation V4 mobile settings surface', () => {
    it('exposes a visible recommendation and visual-style settings entry', () => {
        const settings = read('mobile/android-alpha2/app/src/main/java/com/picalibrary/android/SettingsActivity.java')
        const activity = read('mobile/android-alpha2/app/src/main/java/com/picalibrary/android/RecommendationStyleActivity.java')
        expect(settings).toContain('推荐与画风')
        expect(settings).toContain('RecommendationStyleActivity.class')
        expect(activity).toContain('画风分析由 Windows / Desktop 完成')
        expect(activity).toContain('BridgeClient.visualStatus')
        expect(activity).toContain('BridgeClient.updateVisualSettings')
    })

    it('keeps E-H with Pica in General instead of a separate desktop account section', () => {
        const hub = read('web/alpha8-7-desktop-hub.js')
        expect(hub).not.toContain("['accounts', 'accounts']")
        expect(hub).toContain("panels.get('general').appendChild(ehAccount)")
        expect(hub).toContain("['recommendations', 'recommendations']")
    })
})
