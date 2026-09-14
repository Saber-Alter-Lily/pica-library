import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('source-oriented product navigation', () => {
  it('keeps Desktop source/account choices collapsed until requested', () => {
    const html = fs.readFileSync('web/index.html', 'utf8')
    expect(html).toContain('<details class="source-picker">')
    expect(html).toContain('id="search-provider"')
    expect(html).toContain('<option value="exh">ExH（需 E-H 账号权限）</option>')
    expect(html).toContain('<details class="wide account-disclosure">')
    expect(html).toContain('<details class="account-advanced">')
    expect(html).not.toContain('<button data-online-source="pica"')
    expect(html).not.toContain('<button data-online-source="eh"')
    expect(html).not.toContain('<button data-online-source="exh"')
  })

  it('uses list dialogs instead of a permanent row of source/account buttons on Android', () => {
    const browse = fs.readFileSync('mobile/android-alpha2/app/src/main/java/com/picalibrary/android/PicaBrowseActivity.java', 'utf8')
    const account = fs.readFileSync('mobile/android-alpha2/app/src/main/java/com/picalibrary/android/EhAccountActivity.java', 'utf8')
    expect(browse).toContain('button("账号与来源"')
    expect(browse).toContain('button("选择来源 ▾"')
    expect(browse).toContain('setSingleChoiceItems(labels,checked')
    expect(browse).toContain('"ExH"')
    expect(browse).not.toContain('bar.addView(button("Pica 账号"')
    expect(browse).not.toContain('bar.addView(button("E-H 账号"')
    expect(account).toContain('button("导入 / 更新会话 ▾"')
    expect(account).toContain('editor.setVisibility(android.view.View.GONE)')
  })
})
