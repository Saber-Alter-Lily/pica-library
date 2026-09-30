import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => fs.readFileSync(path, 'utf8')

describe('cross-client UI hierarchy corrective pass', () => {
    it('gives the modern Library toolbar sole ownership of display controls', () => {
        const parity = read('web/v040-parity.js')
        const polish = read('web/ui-polish-v5.js')

        expect(parity).toContain('function restoreLegacyLibraryControls()')
        expect(parity).not.toContain(
            "const move = ['#filter-author-input','#filter-tag','#filter-tag-mode','#view-grid','#view-list','.grid-size-controls','#cover-toggle']"
        )
        expect(polish).toContain("moveNodes(primary, [\n        ux$('#view-grid'),\n        ux$('#view-list')")
        expect(polish).toContain("makeDetails('ux-library-display', 'displayOptions')")
        expect(polish).toContain("toolbar.querySelector('.grid-size-controls')")
        expect(polish).toContain("ux$('#cover-toggle')?.closest('label')")
    })

    it('uses progressive disclosure for low-frequency Web actions', () => {
        const polish = read('web/ui-polish-v5.js')
        expect(polish).toContain("recommendationMore: '更多推荐操作'")
        expect(polish).toContain("runtimeSettings: '本机与网络设置'")
        expect(polish).toContain("makeDetails('ux-recommend-more', 'recommendationMore')")
        expect(polish).toContain('function installGeneralRuntimeDisclosure()')
        expect(polish).toContain("makeDetails('ux-runtime-settings', 'runtimeSettings')")
        expect(polish).toContain("makeDetails('ux-recommend-display', 'displayOptions')")
    })

    it('keeps one six-section Settings hierarchy with connection health in Connections', () => {
        const hub = read('web/alpha8-7-desktop-hub.js')
        const connections = read('web/alpha8-connections.js')
        const index = read('web/index.html')
        expect(hub).toContain("['recommendations', 'recommendations']")
        expect(hub).toContain("['maintenance', 'maintenance']")
        expect(hub).not.toContain("['software', 'software']")
        expect(hub).toContain("maintenancePanel.prepend(software)")
        expect(index).toContain('data-tab="software-updates"')
        expect(hub).not.toContain("updateTabButton?.remove()")
        expect(hub).toContain("connectionsSlot.prepend(connectionStatus)")
        expect(hub).toContain("if (id === 'software') id = 'maintenance'")
        expect(connections).toContain("const connections = $c('#a87-connections-panel')")
        expect(connections).toContain('connections.prepend(panel)')
    })

    it('drives onboarding from owner state and visible target geometry', () => {
        const onboarding = read('web/onboarding-v1.js')
        expect(onboarding).toContain('function visibleTarget(selector)')
        expect(onboarding).toContain('rect.width <= 0')
        expect(onboarding).toContain('rect.height <= 0')
        expect(onboarding).toContain('function viewTarget(viewId, selector)')
        expect(onboarding).toContain('function settingsTarget(panelId, selector, disclosureSelector = null)')
        expect(onboarding).toContain("settingsTarget('recommendations','#visual-rerank-mode','#ux-visual-settings')")
        expect(onboarding).toContain("settingsTarget('connections','#a83-connections')")
        expect(onboarding).toContain("settingsTarget('general','#settings-eh-account')")
        expect(onboarding).toContain("settingsTarget('maintenance','#software-updates')")
        expect(onboarding).not.toContain('function moveAfterClick(')
        expect(onboarding).not.toContain('advanceOnClick: true')
        expect(onboarding).not.toContain('setTimeout(() => opts.driver.moveNext(), 140)')
    })
})
