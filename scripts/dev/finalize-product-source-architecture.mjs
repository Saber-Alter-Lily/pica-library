import fs from 'node:fs'

function replaceOne(path,before,after,label){let value=fs.readFileSync(path,'utf8');const first=value.indexOf(before);if(first<0)throw new Error(`missing ${label}`);if(value.indexOf(before,first+before.length)>=0)throw new Error(`duplicate ${label}`);fs.writeFileSync(path,value.slice(0,first)+after+value.slice(first+before.length))}

// “All sources” includes ExH opportunistically. ProviderService already uses allSettled,
// so one unavailable source must not suppress other successful providers.
replaceOne('src/library/service.ts',"query.providers?.length ? query.providers : ['pica', 'eh']","query.providers?.length ? query.providers : ['pica', 'eh', 'exh']",'default all online sources')

// The behavioral ExH test uses the existing discover provenance contract.
replaceOne('test/unit/eh-cross-source-v3.test.ts',"['exh'], 'online')","['exh'], 'discover')",'ExH contract provenance')

let contract=fs.readFileSync('test/unit/eh-cross-source-v3.test.ts','utf8')
const close='\n})\n'
if(!contract.endsWith(close))throw new Error('cross-source suite close not found')
const tolerance=`\n  it('keeps successful sources when ExH is unavailable but fails an explicit ExH-only request', async () => {\n    const db = database()\n    const fakeEh = { id: 'eh', capabilities: {}, search: async (input: { surface?: string }) => {\n      if (input.surface === 'exh') throw new Error('ExH unavailable')\n      return [{ providerId: 'eh', providerRemoteId: '345678:abcdef1234', comicId: 'eh:345678:abcdef1234', title: 'Public Fixture', alternateTitles: [], author: 'Artist', authors: ['Artist'], circle: null, description: '', chineseTeam: '', categories: ['Manga'], tags: ['tag'], canonicalTags: [], completionStatus: 'UNKNOWN', pagesCount: 8, epsCount: 1, providerMetadata: { rawTags: [] } }]\n    }, details: async () => { throw new Error('unused') }, episodes: async () => [], pages: async () => [], fetchPage: async () => { throw new Error('unused') }, fetchCover: async () => { throw new Error('unused') } } as unknown as EhProvider\n    const service = new ProviderService(async () => ({} as Pica), db, fakeEh)\n    const mixed = await service.search({ keyword: 'tag', limit: 10 }, ['eh', 'exh'], 'discover')\n    expect(mixed.map((item) => item.comicId)).toEqual(['eh:345678:abcdef1234'])\n    await expect(service.search({ keyword: 'tag', limit: 10 }, ['exh'], 'discover')).rejects.toThrow('ExH unavailable')\n    db.close()\n  })\n`
contract=contract.slice(0,-close.length)+tolerance+close
fs.writeFileSync('test/unit/eh-cross-source-v3.test.ts',contract)

fs.writeFileSync('test/unit/eh-product-navigation.test.ts',`import fs from 'node:fs'\nimport { describe, expect, it } from 'vitest'\n\ndescribe('source-oriented product navigation', () => {\n  it('keeps Desktop source/account choices collapsed until requested', () => {\n    const html = fs.readFileSync('web/index.html', 'utf8')\n    expect(html).toContain('<details class="source-picker">')\n    expect(html).toContain('id="search-provider"')\n    expect(html).toContain('<option value="exh">ExH（需 E-H 账号权限）</option>')\n    expect(html).toContain('<details class="wide account-disclosure">')\n    expect(html).toContain('<details class="account-advanced">')\n    expect(html).not.toContain('<button data-online-source="pica"')\n    expect(html).not.toContain('<button data-online-source="eh"')\n    expect(html).not.toContain('<button data-online-source="exh"')\n  })\n\n  it('uses list dialogs instead of a permanent row of source/account buttons on Android', () => {\n    const browse = fs.readFileSync('mobile/android-alpha2/app/src/main/java/com/picalibrary/android/PicaBrowseActivity.java', 'utf8')\n    const account = fs.readFileSync('mobile/android-alpha2/app/src/main/java/com/picalibrary/android/EhAccountActivity.java', 'utf8')\n    expect(browse).toContain('button("账号与来源"')\n    expect(browse).toContain('button("选择来源 ▾"')\n    expect(browse).toContain('setSingleChoiceItems(labels,checked')\n    expect(browse).toContain('"ExH"')\n    expect(browse).not.toContain('bar.addView(button("Pica 账号"')\n    expect(browse).not.toContain('bar.addView(button("E-H 账号"')\n    expect(account).toContain('button("导入 / 更新会话 ▾"')\n    expect(account).toContain('editor.setVisibility(android.view.View.GONE)')\n  })\n})\n`)

// Android's native Pica model stores popularity counters as int. Unified cross-source
// catalog values are long, so saturate rather than allowing overflow or a lossy cast.
replaceOne(
  'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/NativeRecommendationEngine.java',
  'entry.knownPictures,1,entry.totalLikes,entry.totalViews);}',
  'entry.knownPictures,1,(int)Math.min(Integer.MAX_VALUE,Math.max(0L,entry.totalLikes)),(int)Math.min(Integer.MAX_VALUE,Math.max(0L,entry.totalViews)));}',
  'Android catalog popularity saturation'
)

console.log('PRODUCT_SOURCE_FINAL_CONTRACTS=APPLIED')
