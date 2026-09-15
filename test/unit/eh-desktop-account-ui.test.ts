import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('E-H Desktop account UI contracts',()=>{
 it('stores session only in DPAPI credentials and never exposes cookie values in status',()=>{
   const types=fs.readFileSync('src/desktop/types.ts','utf8');const main=fs.readFileSync('src/desktop/main.ts','utf8')
   expect(types).toContain('ehMemberId?: string');expect(types).toContain('ehPassHash?: string')
   expect(main).toContain('credentialsStore.save(next)');expect(main).toContain('ehAccount: {')
   const statusBlock=main.slice(main.indexOf('status: () => ({'),main.indexOf('importThemePack:',main.indexOf('status: () => ({')));expect(statusBlock).not.toContain('ehPassHash:');expect(statusBlock).not.toContain('ehMemberId:')
 })
 it('keeps public E-H explicitly independent from account setup',()=>{const html=fs.readFileSync('web/index.html','utf8');const js=fs.readFileSync('web/eh-account.js','utf8');expect(html).toContain('公共搜索、阅读和下载无需登录');expect(js).toContain("ehAccountAction: 'clear-session'");expect(html).toContain('https://forums.e-hentai.org/index.php?act=Login')})
 it('presents ExH as an observed optional capability rather than a permanent entitlement verdict',()=>{const js=fs.readFileSync('web/eh-account.js','utf8');expect(js).toContain('ExH 扩展：');expect(js).toContain("if (value === 'UNAVAILABLE') return '当前不可访问'");expect(js).toContain("if (value === 'NETWORK_ERROR') return '暂无法确认'");expect(js).not.toContain('无权限')})
})
