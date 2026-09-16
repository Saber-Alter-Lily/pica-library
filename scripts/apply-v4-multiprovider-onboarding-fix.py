from pathlib import Path


def replace_once(path: str, before: str, after: str) -> None:
    p = Path(path)
    text = p.read_text(encoding='utf-8')
    if after in text:
        return
    if before not in text:
        raise SystemExit(f'anchor not found in {path}: {before[:80]!r}')
    p.write_text(text.replace(before, after, 1), encoding='utf-8')


replace_once(
    'web/index.html',
    '''                    <form id="setup-form" class="settings-form">\n''',
    '''                    <article class="notice setup-provider-entry">\n                        <strong>多来源模式 / Multi-provider</strong>\n                        <p>Pica 可以稍后配置。E-H 公共搜索、阅读和下载无需登录；如需同步 E-H 云收藏或访问 ExH，可直接配置 E-H / ExH 会话。</p>\n                        <div class="actions">\n                            <button id="setup-open-eh" type="button" class="primary">配置 E-H / ExH</button>\n                            <button id="setup-open-settings" type="button">打开账号与来源设置</button>\n                        </div>\n                    </article>\n                    <form id="setup-form" class="settings-form">\n'''
)

replace_once(
    'web/app.js',
    '''        if (!desktop.configured) {\n            document.body.classList.add('onboarding')\n            document.querySelector('nav').hidden = true\n            activateView('setup')\n''',
    '''        if (!desktop.configured) {\n            document.body.classList.add('onboarding')\n            // Multi-provider onboarding must not hide E-H / ExH account access.\n            // Pica setup remains available, but is no longer the gate to Settings.\n            document.querySelector('nav').hidden = false\n            activateView('setup')\n'''
)

replace_once(
    'web/app.js',
    '''installAccountOnboarding({ post: desktopPost, getDesktop: () => desktop, getLanguage: () => language })\nconst downloadedCloud = createDownloadedCloud({ post: desktopPost, getDesktop: () => desktop, getLanguage: () => language })\n''',
    '''installAccountOnboarding({ post: desktopPost, getDesktop: () => desktop, getLanguage: () => language })\n$('#setup-open-settings').onclick = () => activateView('settings')\n$('#setup-open-eh').onclick = () => {\n    activateView('settings')\n    const panel = $('#settings-eh-account')\n    panel.open = true\n    panel.scrollIntoView({ behavior: 'smooth', block: 'start' })\n}\nconst downloadedCloud = createDownloadedCloud({ post: desktopPost, getDesktop: () => desktop, getLanguage: () => language })\n'''
)

Path('test/unit/recommendation-v4-multiprovider-onboarding.test.ts').write_text('''import fs from 'node:fs'\nimport { describe, expect, it } from 'vitest'\n\ndescribe('Recommendation V4 multi-provider onboarding', () => {\n    it('keeps E-H / ExH account access visible before Pica setup', () => {\n        const html = fs.readFileSync('web/index.html', 'utf8')\n        const app = fs.readFileSync('web/app.js', 'utf8')\n        expect(html).toContain('id="setup-open-eh"')\n        expect(html).toContain('E-H 公共搜索、阅读和下载无需登录')\n        expect(html).toContain('配置 E-H / ExH')\n        expect(app).not.toContain("document.querySelector('nav').hidden = true")\n        expect(app).toContain("$('#setup-open-eh').onclick")\n        expect(app).toContain("const panel = $('#settings-eh-account')")\n        expect(app).toContain('panel.open = true')\n    })\n})\n''', encoding='utf-8')
