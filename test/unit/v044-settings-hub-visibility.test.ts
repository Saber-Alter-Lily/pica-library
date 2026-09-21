import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(import.meta.dirname, '../..')
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

describe('v0.4.4 Desktop settings hub visibility', () => {
    it('migrates support into General before hiding legacy Settings', () => {
        const hub = read('web/alpha8-7-desktop-hub.js')
        expect(hub).toContain("const support = hub$('#a83-support')")
        expect(hub).toContain("general.appendChild(support)")
        expect(hub).toContain("moveProductSettingsPanels()")
        const hidden = hub.indexOf('settings.hidden = true')
        const migration = hub.indexOf('moveProductSettingsPanels()', hidden)
        expect(hidden).toBeGreaterThan(0)
        expect(migration).toBeGreaterThan(hidden)
    })

    it('migrates base appearance into the Appearance panel', () => {
        const hub = read('web/alpha8-7-desktop-hub.js')
        expect(hub).toContain("const appearance = hub$('#a83-appearance')")
        expect(hub).toContain("appearanceSlot.prepend(appearance)")
    })

    it('has a real-browser smoke assertion for visible support', () => {
        const smoke = read('test/e2e/web-smoke.spec.mjs')
        expect(smoke).toContain("#a87-general-panel #a83-support")
        expect(smoke).toContain("#a87-appearance-panel #a83-appearance")
        expect(smoke).toContain("#a83-afdian")
        expect(smoke).toContain("#a83-star")
    })
})
