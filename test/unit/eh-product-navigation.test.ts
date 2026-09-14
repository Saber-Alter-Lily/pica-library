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

  it('progressively discloses Desktop filters, account actions and batch actions', () => {
    const script = fs.readFileSync('web/eh-account.js', 'utf8')
    expect(script).toContain("summary.textContent = '筛选 ▾'")
    expect(script).toContain("disclosure('官方账号 ▾'")
    expect(script).toContain("disclosure('账号功能 ▾'")
    expect(script).toContain("disclosure('批量操作 ▾'")
    expect(script).toContain("$('#recommend-next-batch')?.classList.add('primary')")
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
    expect(browse).toContain('button("Pica 功能 ▾"')
    expect(browse).not.toContain('actions.addView(button("Pica 收藏"')
    expect(browse).not.toContain('actions.addView(button("Pica 24h"')
    expect(browse).not.toContain('actions.addView(button("Pica 分类"')
    expect(browse).toContain('primaryButton("搜索"')
    expect(browse).toContain('else loadCombined();')
    expect(browse).toContain('ExH 尚未启用')
    expect(browse).toContain('primaryButton("连接 E-H 账号"')
    expect(account).toContain('button("导入 / 更新会话 ▾"')
    expect(account).toContain('editor.setVisibility(android.view.View.GONE)')
    expect(account).toContain('button("官方账号 ▾"')
    expect(account).toContain('button("账号功能 ▾"')
    expect(account).toContain('Button save=button("保存并验证"')
    expect(account).toContain('compactParams()')
    expect(account).not.toContain('links.addView(button("官方登录页"')
  })

  it('keeps Android touch targets while reducing default button chrome', () => {
    const ui = fs.readFileSync('mobile/android-alpha2/app/src/main/java/com/picalibrary/android/Ui.java', 'utf8')
    expect(ui).toContain('b.setMinWidth(0)')
    expect(ui).toContain('compact?44:48')
    expect(ui).toContain('compact?10:14')
  })
})
