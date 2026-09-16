import fs from 'node:fs'

const hubFile = 'web/alpha8-7-desktop-hub.js'
let hub = fs.readFileSync(hubFile, 'utf8')

function replaceOnce(before, after, label) {
    if (hub.includes(after)) return
    if (!hub.includes(before)) throw new Error(`Missing anchor: ${label}`)
    hub = hub.replace(before, after)
}

replaceOnce(
    "        general: '基本设置',\n        connections: '连接与同步',\n        appearance: '外观与个性化',",
    "        general: '基本设置',\n        accounts: '账号与来源',\n        recommendations: '推荐与画风',\n        connections: '连接与同步',\n        appearance: '外观与个性化',",
    'zh labels'
)
replaceOnce(
    "        general: 'General',\n        connections: 'Connections & Sync',\n        appearance: 'Appearance',",
    "        general: 'General',\n        accounts: 'Accounts & Providers',\n        recommendations: 'Recommendations & Visual Style',\n        connections: 'Connections & Sync',\n        appearance: 'Appearance',",
    'en labels'
)
replaceOnce(
    "const panelDefinitions = [\n    ['general', 'general'],\n    ['connections', 'connections'],",
    "const panelDefinitions = [\n    ['general', 'general'],\n    ['accounts', 'accounts'],\n    ['recommendations', 'recommendations'],\n    ['connections', 'connections'],",
    'panel definitions'
)
replaceOnce(
    "function movePersonalization() {",
    "function openSettingsHubPanel(id) {\n    const navButton = hub$('nav button[data-view=\"maintenance\"]')\n    navButton?.click()\n    activateHubPanel(id)\n}\n\nfunction movePersonalization() {",
    'hub opener'
)
replaceOnce(
    "    const settingsForm = hub$('#settings-form')\n    if (settingsForm) panels.get('general').appendChild(settingsForm)\n\n    for (const id of ['settings-mobile-bridge', 'settings-remote-storage', 'settings-browser-lite']) {",
    "    const settingsForm = hub$('#settings-form')\n    if (settingsForm) panels.get('general').appendChild(settingsForm)\n\n    const ehAccount = hub$('#settings-eh-account')\n    if (ehAccount) {\n        ehAccount.open = true\n        panels.get('accounts').appendChild(ehAccount)\n    }\n\n    const recommendationV4 = hub$('#settings-recommendation-v4')\n    if (recommendationV4) panels.get('recommendations').appendChild(recommendationV4)\n\n    for (const id of ['settings-mobile-bridge', 'settings-remote-storage', 'settings-browser-lite']) {",
    'move V4 panels'
)
replaceOnce(
    "    installObservers()\n    hub$('#language-select')?.addEventListener('change', () => setTimeout(refreshHubLabels, 0))",
    "    installObservers()\n    hub$('#setup-open-eh')?.addEventListener('click', () => setTimeout(() => openSettingsHubPanel('accounts'), 0))\n    hub$('#setup-open-settings')?.addEventListener('click', () => setTimeout(() => openSettingsHubPanel('general'), 0))\n    hub$('#language-select')?.addEventListener('change', () => setTimeout(refreshHubLabels, 0))",
    'first-run routing'
)

fs.writeFileSync(hubFile, hub)

const testFile = 'test/unit/recommendation-v4-settings-hub.test.ts'
fs.writeFileSync(
    testFile,
    `import fs from 'node:fs'\nimport { describe, expect, it } from 'vitest'\n\nconst hub = fs.readFileSync('web/alpha8-7-desktop-hub.js', 'utf8')\n\ndescribe('Recommendation V4 settings hub', () => {\n    it('exposes dedicated Accounts and Recommendations sections', () => {\n        expect(hub).toContain(\"accounts: '账号与来源'\")\n        expect(hub).toContain(\"recommendations: '推荐与画风'\")\n        expect(hub).toContain(\"['accounts', 'accounts']\")\n        expect(hub).toContain(\"['recommendations', 'recommendations']\")\n    })\n\n    it('moves E-H and visual controls out of the hidden legacy Settings container', () => {\n        expect(hub).toContain(\"const ehAccount = hub$('#settings-eh-account')\")\n        expect(hub).toContain(\"panels.get('accounts').appendChild(ehAccount)\")\n        expect(hub).toContain(\"const recommendationV4 = hub$('#settings-recommendation-v4')\")\n        expect(hub).toContain(\"panels.get('recommendations').appendChild(recommendationV4)\")\n    })\n\n    it('routes first-run provider actions into the visible settings hub', () => {\n        expect(hub).toContain(\"openSettingsHubPanel('accounts')\")\n        expect(hub).toContain(\"openSettingsHubPanel('general')\")\n    })\n})\n`
)
