import fs from 'node:fs'
import { pathToFileURL } from 'node:url'

const source='scripts/dev/apply-product-source-architecture.mjs'
let text=fs.readFileSync(source,'utf8')
const originalOnce="const once=(p,a,b,label)=>{let s=read(p);const i=s.indexOf(a);if(i<0)throw new Error(`missing ${label}`);if(s.indexOf(a,i+a.length)>=0)throw new Error(`duplicate ${label}`);write(p,s.slice(0,i)+b+s.slice(i+a.length))}"
const robustOnce="const once=(p,a,b,label)=>{let s=read(p);const i=s.indexOf(a);if(i<0){if(label==='web pica account disclosure'){const r=/<label[\\s\\S]{0,700}?id=\\\"settings-account\\\"[\\s\\S]{0,700}?<\\/label\\s*>[\\s\\S]{0,300}?<label[\\s\\S]{0,700}?id=\\\"settings-password\\\"[\\s\\S]{0,700}?<\\/label\\s*>/;const m=s.match(r);if(!m)throw new Error(`missing ${label}`);write(p,s.replace(r,b));return}throw new Error(`missing ${label}`)}if(s.indexOf(a,i+a.length)>=0)throw new Error(`duplicate ${label}`);write(p,s.slice(0,i)+b+s.slice(i+a.length))}"
if(!text.includes(originalOnce))throw new Error('once helper anchor not found')
text=text.replace(originalOnce,robustOnce)
const fixes=[
  [
    'once(p,"    type ComicProvider,\\n    type ProviderComic,\\n    type SearchRequest\\n", "    type ComicProvider,\\n    type EhSurface,\\n    type ProviderComic,\\n    type SearchRequest\\n",\'eh import surface\')',
    'once(p,"    ComicProvider,\\n    ProviderComic,\\n    SearchRequest\\n", "    ComicProvider,\\n    EhSurface,\\n    ProviderComic,\\n    SearchRequest\\n",\'eh import surface\')'
  ]
]
for(const [before,after] of fixes){if(!text.includes(before))throw new Error('wrapper anchor not found');text=text.replace(before,after)}
const marker="console.log('PRODUCT_SOURCE_ARCHITECTURE_PATCH=APPLIED')"
if(!text.includes(marker))throw new Error('patch completion marker not found')
text=text.replace(marker,"once('src/providers/eh-provider.ts', '.map(ehMetadataToComic)', \".map((item) => ehMetadataToComic(item, 'eh'))\", 'E-H metadata mapper callback')\n\n"+marker)
const temp='scripts/dev/.run-product-source-architecture.mjs'
fs.writeFileSync(temp,text)
try{await import(pathToFileURL(process.cwd()+'/'+temp).href+'?v='+Date.now())}finally{fs.rmSync(temp,{force:true})}

function replaceOne(path,before,after,label){let value=fs.readFileSync(path,'utf8');const first=value.indexOf(before);if(first<0)throw new Error(`post-patch missing ${label}`);if(value.indexOf(before,first+before.length)>=0)throw new Error(`post-patch duplicate ${label}`);fs.writeFileSync(path,value.slice(0,first)+after+value.slice(first+before.length))}

// Keep ordinary app.js free of hard-coded locale text.
replaceOne('web/app.js',"    if (Number(comic?.downloadedPictures || 0) > 0) values.push('Windows 本机')","    if (Number(comic?.downloadedPictures || 0) > 0) values.push(t('library.replica.windows'))",'Windows replica i18n')
replaceOne('web/app.js',"    const status = comic?.completionStatus === 'UNKNOWN' ? '完结状态未知' : comic?.completionStatus === 'FINISHED' ? '已完结' : '连载/未完结'","    const status = comic?.completionStatus === 'UNKNOWN' ? t('library.status.unknown') : comic?.completionStatus === 'FINISHED' ? t('library.status.finished') : t('library.status.ongoing')",'edition status i18n')
replaceOne('web/app.js',"    return `<details class=\"comic-bindings\"><summary>来源与副本</summary><p><strong>版本</strong> · ${escapeHtml(status)}</p><p><strong>在线来源</strong> · ${escapeHtml(sources.join(' / ') || '未记录')}</p><p><strong>实际副本</strong> · ${escapeHtml(replicas.join(' / ') || '暂无本机副本')}</p></details>`","    return `<details class=\"comic-bindings\"><summary>${escapeHtml(t('library.bindings.summary'))}</summary><p><strong>${escapeHtml(t('library.bindings.version'))}</strong> · ${escapeHtml(status)}</p><p><strong>${escapeHtml(t('library.bindings.online'))}</strong> · ${escapeHtml(sources.join(' / ') || t('library.bindings.noneSource'))}</p><p><strong>${escapeHtml(t('library.bindings.replicas'))}</strong> · ${escapeHtml(replicas.join(' / ') || t('library.bindings.noneReplica'))}</p></details>`",'library disclosure i18n')
replaceOne('web/app.js',"        const providerLabels = { all: '全部可用来源', pica: 'Pica', eh: 'E-H 公共', exh: 'ExH' }","        const providerLabels = { all: t('online.source.all'), pica: t('online.source.pica'), eh: t('online.source.eh'), exh: t('online.source.exh') }",'online source i18n')

const i18nPath='web/i18n.js'
replaceOne(i18nPath,"        'library.progress': 'Progress',","        'library.progress': 'Progress',\n        'library.bindings.summary': 'Sources & copies',\n        'library.bindings.version': 'Edition',\n        'library.bindings.online': 'Online sources',\n        'library.bindings.replicas': 'Copies',\n        'library.bindings.noneSource': 'Not recorded',\n        'library.bindings.noneReplica': 'No local copy',\n        'library.replica.windows': 'Windows local',\n        'library.status.unknown': 'Status unknown',\n        'library.status.finished': 'Completed',\n        'library.status.ongoing': 'Ongoing',\n        'online.source.all': 'All available sources',\n        'online.source.pica': 'Pica',\n        'online.source.eh': 'E-H public',\n        'online.source.exh': 'ExH',",'English source translations')
replaceOne(i18nPath,"        'library.progress': '进度',","        'library.progress': '进度',\n        'library.bindings.summary': '来源与副本',\n        'library.bindings.version': '版本',\n        'library.bindings.online': '在线来源',\n        'library.bindings.replicas': '实际副本',\n        'library.bindings.noneSource': '未记录',\n        'library.bindings.noneReplica': '暂无本机副本',\n        'library.replica.windows': 'Windows 本机',\n        'library.status.unknown': '完结状态未知',\n        'library.status.finished': '已完结',\n        'library.status.ongoing': '连载/未完结',\n        'online.source.all': '全部可用来源',\n        'online.source.pica': 'Pica',\n        'online.source.eh': 'E-H 公共',\n        'online.source.exh': 'ExH',",'Chinese source translations')

// Replace the old E-H-only static contract with the new all-source contract.
const contractPath='test/unit/eh-cross-source-v3.test.ts'
let contract=fs.readFileSync(contractPath,'utf8')
contract=contract.replace(
`    expect(desktop).toContain('const ehMaxRequests = 4')
    expect(desktop).toContain("['eh']")
    expect(desktop).toContain("'recommendations'")
    expect(mobile).toContain('EH_MAX_REQUESTS=4')
    expect(mobile).toContain('new EhClient(app)')
    expect(mobile).toContain('UnifiedEhCatalogSync.mergeAll')
    expect(mobile).toContain('comic.pagesCount,1,0,0')`,
`    expect(desktop).toContain("const sourceBudget: Record<'eh' | 'exh', number> = { eh: 4, exh: 2 }")
    expect(desktop).toContain("externalSearch(query, 'keyword', 'eh')")
    expect(desktop).toContain("externalSearch(query, 'keyword', 'exh')")
    expect(desktop).toContain('preferenceSignals')
    expect(desktop).toContain("comic.isFavorite || comic.inLibrary || comic.downloadedPictures > 0 || readingIds.has(comic.comicId)")
    expect(mobile).toContain('EH_MAX_REQUESTS=4,EXH_MAX_REQUESTS=2')
    expect(mobile).toContain('ehClient.search(q,"eh")')
    expect(mobile).toContain('ehClient.search(q,"exh")')
    expect(mobile).toContain('known.favorite||known.inShelf||known.phoneDownloaded||known.desktopDownloaded||known.remoteAvailable')`)
if(contract.includes("const ehMaxRequests = 4"))throw new Error('legacy V3 contract was not replaced')
fs.writeFileSync(contractPath,contract)

// Add a behavioral contract that ExH is an E-H surface, not a new provider identity.
const insertion=`\n  it('routes ExH through the E-H provider while preserving canonical identity', async () => {\n    const db = database()\n    let observedSurface = ''\n    const fakeEh = { id: 'eh', capabilities: {}, search: async (input: { surface?: string }) => { observedSurface = String(input.surface || ''); return [{ providerId: 'eh', providerRemoteId: '234567:abcdef1234', comicId: 'eh:234567:abcdef1234', title: 'ExH Fixture', alternateTitles: [], author: 'Artist', authors: ['Artist'], circle: null, description: '', chineseTeam: '', categories: ['Doujinshi'], tags: ['tag'], canonicalTags: [], completionStatus: 'UNKNOWN', pagesCount: 10, epsCount: 1, rating: 4.8, providerMetadata: { rawTags: [] } }] }, details: async () => { throw new Error('unused') }, episodes: async () => [], pages: async () => [], fetchPage: async () => { throw new Error('unused') }, fetchCover: async () => { throw new Error('unused') } } as unknown as EhProvider\n    const service = new ProviderService(async () => ({} as Pica), db, fakeEh)\n    const records = await service.search({ keyword: 'tag', limit: 10 }, ['exh'], 'online')\n    expect(observedSurface).toBe('exh')\n    expect(records[0]).toMatchObject({ comicId: 'eh:234567:abcdef1234', providerId: 'eh' })\n    expect(records[0].providerMetadata).toMatchObject({ preferredSurface: 'exh', knownSurfaces: ['exh'] })\n    db.close()\n  })\n`
const close='\n})\n'
if(!contract.endsWith(close))throw new Error('cross-source contract close not found')
contract=contract.slice(0,-close.length)+insertion+close
fs.writeFileSync(contractPath,contract)

console.log('PRODUCT_SOURCE_POST_PATCH=APPLIED')
