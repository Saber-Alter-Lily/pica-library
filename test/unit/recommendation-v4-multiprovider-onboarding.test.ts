import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('Recommendation V4 multi-provider onboarding', () => {
    it('keeps E-H / ExH account access visible before Pica setup', () => {
        const html = fs.readFileSync('web/index.html', 'utf8')
        const app = fs.readFileSync('web/app.js', 'utf8')
        expect(html).toContain('id="setup-open-eh"')
        expect(html).toContain('E-H 公共搜索、阅读和下载无需登录')
        expect(html).toContain('配置 E-H / ExH')
        expect(app).not.toContain("document.querySelector('nav').hidden = true")
        expect(app).toContain("$('#setup-open-eh').onclick")
        expect(app).toContain("const panel = $('#settings-eh-account')")
        expect(app).toContain('panel.open = true')
    })
})
