import fs from 'node:fs'

function read(file) { return fs.readFileSync(file, 'utf8') }
function write(file, value) { fs.writeFileSync(file, value) }
function replaceOnce(text, search, replacement, label) {
  const index = text.indexOf(search)
  if (index < 0) throw new Error(`patch anchor missing: ${label}`)
  if (text.indexOf(search, index + search.length) >= 0) throw new Error(`patch anchor duplicated: ${label}`)
  return text.slice(0, index) + replacement + text.slice(index + search.length)
}

// Provider searches retain explicit provenance by usage context.
{
  const file = 'src/services/provider-service.ts'
  let text = read(file)
  text = replaceOnce(text,
`    async search(
        input: string | SearchRequest,
        providers: ProviderId[] = ['pica']
    ) {
`,
`    async search(
        input: string | SearchRequest,
        providers: ProviderId[] = ['pica'],
        provenance: 'discover' | 'recommendations' = 'discover'
    ) {
`, 'provider search provenance signature')
  text = replaceOnce(text,
`                this.database.importCatalog(records, \`${'${providerId}'}:discover\`)
`,
`                this.database.importCatalog(records, \`${'${providerId}'}:${'${provenance}'}\`)
`, 'provider search provenance write')
  write(file, text)
}

// Desktop V3: preserve full Pica route budget and add four cached E-H first-page semantic routes.
{
  const file = 'src/library/service.ts'
  let text = read(file)
  text = replaceOnce(text,
`    RecallRoute,
    SortMode
`,
`    RecallRoute,
    SortMode,
    StoredComic
`, 'StoredComic import')
  text = replaceOnce(text,
`        const pica = await this.connect()
        const catalog = this.database.listComics({ limit: 10000 })
`,
`        const pica = await this.connect()
        const providerService = new ProviderService(
            () => this.connect(),
            this.database
        )
        const catalog = this.database.listComics({ limit: 10000 })
`, 'V3 provider service')
  const oldStore = `        const store = (comics: Comic[]) => {
            const records = comics.map(comicToRecord)
            this.database.importCatalog(records, 'pica:recommendations')
            return records.flatMap((record) => {
                const stored = this.database.getComic(record.comicId)
                return stored ? [stored] : []
            })
        }
`
  const newStore = `        const storePica = (comics: Comic[]) => {
            const records = comics.map(comicToRecord)
            this.database.importCatalog(records, 'pica:recommendations')
            return records.flatMap((record) => {
                const stored = this.database.getComic(record.comicId)
                return stored ? [stored] : []
            })
        }
        const storedRecords = (records: FavoriteRecord[]): StoredComic[] =>
            records.flatMap((record) => {
                const stored = this.database.getComic(record.comicId)
                return stored ? [stored] : []
            })
        const mergeProviderResults = (
            primary: StoredComic[],
            secondary: StoredComic[]
        ) => [
            ...new Map(
                [...primary, ...secondary].map((comic) => [comic.comicId, comic])
            ).values()
        ]
        const ehCache = new Map<string, StoredComic[]>()
        const ehMaxRequests = 4
        let ehRequestCount = 0
        const ehSearch = async (
            query: string,
            kind: 'keyword' | 'author'
        ): Promise<StoredComic[]> => {
            const clean = query.trim()
            if (!clean) return []
            const key = \`${'${kind}'}:${'${clean.toLocaleLowerCase("und")}'}\`
            const cached = ehCache.get(key)
            if (cached) return cached
            if (ehRequestCount >= ehMaxRequests) return []
            ehRequestCount += 1
            const providerQuery =
                kind === 'author'
                    ? \`artist:\"${'${clean.replaceAll("\\\"", "")}'}\"\`
                    : clean
            try {
                const records = await providerService.search(
                    { keyword: providerQuery, limit: 40 },
                    ['eh'],
                    'recommendations'
                )
                const stored = storedRecords(records)
                ehCache.set(key, stored)
                return stored
            } catch {
                ehCache.set(key, [])
                return []
            }
        }
`
  text = replaceOnce(text, oldStore, newStore, 'V3 cross-source stores')
  const oldProvider = `            provider: {
                keyword: async (query, page) =>
                    store(
                        (
                            await pica.comicsPage(
                                '',
                                query,
                                pica.Order.loved,
                                page
                            )
                        ).docs
                    ),
                author: async (query, page) =>
                    store(
                        (await pica.search(query, page, pica.Order.loved)).docs
                    ),
                related: async (comicId) => store(await pica.related(comicId))
            },
`
  const newProvider = `            provider: {
                keyword: async (query, page) => {
                    const picaResults = storePica(
                        (
                            await pica.comicsPage(
                                '',
                                query,
                                pica.Order.loved,
                                page
                            )
                        ).docs
                    )
                    const ehResults =
                        page === 1 ? await ehSearch(query, 'keyword') : []
                    return mergeProviderResults(picaResults, ehResults)
                },
                author: async (query, page) => {
                    const picaResults = storePica(
                        (await pica.search(query, page, pica.Order.loved)).docs
                    )
                    const ehResults =
                        page === 1 ? await ehSearch(query, 'author') : []
                    return mergeProviderResults(picaResults, ehResults)
                },
                related: async (comicId) =>
                    comicId.startsWith('eh:')
                        ? []
                        : storePica(await pica.related(comicId))
            },
`
  text = replaceOnce(text, oldProvider, newProvider, 'V3 provider routes')
  text = replaceOnce(text,
`            telemetry: { ...retrieved.telemetry, cycleId },
`,
`            telemetry: {
                ...retrieved.telemetry,
                cycleId,
                providerSources: {
                    ehRequests: ehRequestCount,
                    ehCandidates: retrieved.candidates.filter(
                        (item) =>
                            item.comic.providerId === 'eh' ||
                            item.comic.comicId.startsWith('eh:')
                    ).length,
                    picaCandidates: retrieved.candidates.filter(
                        (item) =>
                            item.comic.providerId !== 'eh' &&
                            !item.comic.comicId.startsWith('eh:')
                    ).length
                }
            },
`, 'V3 provider telemetry')
  write(file, text)
}

// Reconciliation labels remain source-neutral while exposing E-H provenance correctly.
{
  const file = 'src/library/database.ts'
  let text = read(file)
  text = replaceOnce(text,
`    if (source === 'pica:discover') return 'search'
    if (source === 'pica:recommendations') return 'recommendation'
`,
`    if (source === 'pica:discover' || source === 'eh:discover') return 'search'
    if (
        source === 'pica:recommendations' ||
        source === 'eh:recommendations'
    )
        return 'recommendation'
`, 'E-H provenance grouping')
  write(file, text)
}

// Desktop result cards show source-specific semantics instead of pretending E-H rating is likes/views.
{
  const file = 'web/app.js'
  let text = read(file)
  text = replaceOnce(text,
`function renderResultCards(records, target, recommendation = false) {
`,
`function providerIdForComic(comic) {
    return comic?.providerId ||
        (String(comic?.comicId || '').startsWith('eh:') ? 'eh' : 'pica')
}

function providerLabelForComic(comic) {
    return providerIdForComic(comic) === 'eh' ? 'E-H' : 'Pica'
}

function providerPopularityForComic(comic) {
    if (providerIdForComic(comic) === 'eh') {
        const rating = Number(comic?.rating)
        return Number.isFinite(rating) && rating > 0
            ? \`★ ${'${rating.toFixed(2)}'}\`
            : '公开元数据'
    }
    return t('message.popularity', {
        likes: Number(comic?.totalLikes || 0).toLocaleString(),
        views: Number(comic?.totalViews || 0).toLocaleString()
    })
}

function providerFavoriteLabel(comic) {
    return providerIdForComic(comic) === 'eh' ? '本地收藏' : t('result.favorite')
}

function renderResultCards(records, target, recommendation = false) {
`, 'provider display helpers')
  text = replaceOnce(text,
`            const comic = item.comic || item
            return \`<article class="result"`,
`            const comic = item.comic || item
            const providerMeta = recommendation
                ? providerLabelForComic(comic)
                : providerLabelForComic(comic) + ' · ' + providerPopularityForComic(comic)
            return \`<article class="result"`, 'provider meta value')
  text = replaceOnce(text,
`                ${'${recommendation ? \'\' : `<p>${t(\'message.popularity\', { likes: Number(comic.totalLikes || 0).toLocaleString(), views: Number(comic.totalViews || 0).toLocaleString() })}</p>`}'}
`,
`                <p class="comic-meta">${'${escapeHtml(providerMeta)}'}</p>
`, 'source-specific popularity line')
  text = replaceOnce(text,
`>${'${t(\'result.favorite\')}'}</button>`,
`>${'${escapeHtml(providerFavoriteLabel(comic))}'}</button>`, 'source-specific favorite label')
  write(file, text)
}

// Android native V3: retain the full Pica request budget and add four E-H first-page routes.
{
  const file = 'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/NativeRecommendationEngine.java'
  let text = read(file)
  const oldRecall = `        emit(progress,"正在从 Pica 多路召回候选",0,NativeRecommendationPolicy.MAX_PROVIDER_REQUESTS);LinkedHashMap<String,Candidate> candidates=new LinkedHashMap<>();int requests=0;
        for(int page=1;page<=NativeRecommendationPolicy.MAX_PAGE&&requests<NativeRecommendationPolicy.MAX_PROVIDER_REQUESTS&&candidates.size()<NativeRecommendationPolicy.TARGET_POOL;page++){
            for(Route route:routes){if(requests>=NativeRecommendationPolicy.MAX_PROVIDER_REQUESTS||candidates.size()>=NativeRecommendationPolicy.TARGET_POOL)break;if(page>1&&"RELATED".equals(route.type))continue;List<PicaClient.Comic> docs;
                try{docs="RELATED".equals(route.type)?client.related(route.seed):client.search(route.query,page,"ld",Collections.emptyList()).comics;}catch(Exception e){requests++;emit(progress,"部分召回路线失败，继续其他路线",requests,NativeRecommendationPolicy.MAX_PROVIDER_REQUESTS);continue;}
                requests++;int baseRank=(page-1)*20;for(int i=0;i<docs.size();i++){PicaClient.Comic comic=docs.get(i);if(comic==null||comic.id.isEmpty()||favoriteById.containsKey(comic.id)||safetyExcluded(registry,comic))continue;Candidate candidate=candidates.get(comic.id);if(candidate==null){candidate=new Candidate(comic);candidates.put(comic.id,candidate);}else if(candidate.comic.tags.isEmpty()&&!comic.tags.isEmpty())candidate.comic=comic;candidate.intentIds.add(route.intentId);candidate.families.add(route.family);candidate.bestProviderRank=Math.min(candidate.bestProviderRank,baseRank+i+1);}emit(progress,"正在从 Pica 多路召回候选",requests,NativeRecommendationPolicy.MAX_PROVIDER_REQUESTS);
            }
        }
        List<PicaClient.Comic> discovered=new ArrayList<>();for(Candidate candidate:candidates.values())discovered.add(candidate.comic);UnifiedPicaCatalogSync.mergeAll(app,discovered);
`
  const newRecall = `        emit(progress,"正在从 Pica + E-H 多路召回候选",0,NativeRecommendationPolicy.MAX_PROVIDER_REQUESTS);LinkedHashMap<String,Candidate> candidates=new LinkedHashMap<>();int requests=0,ehRequests=0;final int EH_MAX_REQUESTS=4;EhClient ehClient=new EhClient(app);List<EhClient.Comic> ehDiscovered=new ArrayList<>();Set<String> allFavoriteIds=new HashSet<>(favoriteById.keySet());for(UnifiedCatalogStore.Entry known:UnifiedCatalogStore.load(app).byId.values())if(known.favorite)allFavoriteIds.add(known.id);
        for(int page=1;page<=NativeRecommendationPolicy.MAX_PAGE&&requests<NativeRecommendationPolicy.MAX_PROVIDER_REQUESTS&&candidates.size()<NativeRecommendationPolicy.TARGET_POOL;page++){
            for(Route route:routes){if(requests>=NativeRecommendationPolicy.MAX_PROVIDER_REQUESTS||candidates.size()>=NativeRecommendationPolicy.TARGET_POOL)break;if(page>1&&"RELATED".equals(route.type))continue;List<PicaClient.Comic> docs;
                try{docs="RELATED".equals(route.type)?client.related(route.seed):client.search(route.query,page,"ld",Collections.emptyList()).comics;}catch(Exception e){requests++;emit(progress,"部分 Pica 召回路线失败，继续其他路线",requests,NativeRecommendationPolicy.MAX_PROVIDER_REQUESTS);continue;}
                requests++;addCandidates(candidates,allFavoriteIds,registry,docs,route,(page-1)*20);
                if(page==1&&!"RELATED".equals(route.type)&&ehRequests<EH_MAX_REQUESTS){ehRequests++;try{String q="AUTHOR".equals(route.type)?"artist:\""+route.query.replace("\"","")+"\"":route.query;List<EhClient.Comic> ehDocs=ehClient.search(q);ehDiscovered.addAll(ehDocs);List<PicaClient.Comic> converted=new ArrayList<>();for(EhClient.Comic comic:ehDocs)converted.add(ehCandidate(comic));addCandidates(candidates,allFavoriteIds,registry,converted,route,0);}catch(Exception ignored){}}
                emit(progress,"正在从 Pica + E-H 多路召回候选",requests,NativeRecommendationPolicy.MAX_PROVIDER_REQUESTS);
            }
        }
        List<PicaClient.Comic> picaDiscovered=new ArrayList<>();for(Candidate candidate:candidates.values())if(!candidate.comic.id.startsWith("eh:"))picaDiscovered.add(candidate.comic);UnifiedPicaCatalogSync.mergeAll(app,picaDiscovered);UnifiedEhCatalogSync.mergeAll(app,ehDiscovered);
`
  text = replaceOnce(text, oldRecall, newRecall, 'Android cross-source recall loop')
  text = replaceOnce(text,
`    private static void markPicaFavorites(Context context,List<PicaClient.Comic> favorites){`,
`    private static PicaClient.Comic ehCandidate(EhClient.Comic comic){List<String> categories=new ArrayList<>();if(comic.category!=null&&!comic.category.isEmpty())categories.add(comic.category);return new PicaClient.Comic(comic.id,comic.title,comic.author,"",comic.coverUrl,"",new ArrayList<>(comic.tags),categories,false,false,comic.pagesCount,1,0,0);}
    private static void addCandidates(LinkedHashMap<String,Candidate> candidates,Set<String> favoriteIds,MobileTagRegistry registry,List<PicaClient.Comic> docs,Route route,int baseRank){for(int i=0;i<docs.size();i++){PicaClient.Comic comic=docs.get(i);if(comic==null||comic.id.isEmpty()||favoriteIds.contains(comic.id)||safetyExcluded(registry,comic))continue;Candidate candidate=candidates.get(comic.id);if(candidate==null){candidate=new Candidate(comic);candidates.put(comic.id,candidate);}else if(candidate.comic.tags.isEmpty()&&!comic.tags.isEmpty())candidate.comic=comic;candidate.intentIds.add(route.intentId);candidate.families.add(route.family);candidate.bestProviderRank=Math.min(candidate.bestProviderRank,baseRank+i+1);}}

    private static void markPicaFavorites(Context context,List<PicaClient.Comic> favorites){`, 'Android candidate helpers')
  write(file, text)
}

// Cross-source regression contracts: real provider records + neutral retriever + mobile source wiring.
{
  const file = 'test/unit/eh-cross-source-v3.test.ts'
  const content = `import fs from 'node:fs'\nimport os from 'node:os'\nimport path from 'node:path'\nimport { afterEach, describe, expect, it } from 'vitest'\nimport { LibraryDatabase } from '../../src/library/database'\nimport { ProviderService } from '../../src/services/provider-service'\nimport { retrieveCandidatesV3 } from '../../src/recommendation-v3/retriever-v3'\nimport type { Pica } from '../../src/sdk'\nimport type { StoredComic } from '../../src/library/types'\nimport type { EhProvider } from '../../src/providers/eh-provider'\n\nconst dirs: string[] = []\nafterEach(() => { for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true }) })\nfunction database() { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-eh-v3-')); dirs.push(dir); return new LibraryDatabase(path.join(dir, 'library.db')) }\nfunction stored(comicId: string, providerId: 'pica' | 'eh'): StoredComic { return { comicId, providerId, providerRemoteId: providerId === 'eh' ? comicId.slice(3) : comicId, title: comicId, author: 'Creator', categories: ['Category'], tags: ['tag'], finished: false, completionStatus: providerId === 'eh' ? 'UNKNOWN' : 'ONGOING', canonicalAuthor: 'Creator', circle: null, authorId: null, isFavorite: false, firstSeenAt: '2026-01-01T00:00:00.000Z', lastSeenAt: '2026-01-01T00:00:00.000Z', knownEpisodes: 0, knownPictures: 0, downloadedPictures: 0 } }\n\ndescribe('E-H cross-source Recommendation V3', () => {\n  it('persists E-H provider identity through ProviderService recommendation search', async () => {\n    const db = database()\n    const fakeEh = { id: 'eh', capabilities: {}, search: async () => [{ providerId: 'eh', providerRemoteId: '123456:abcdef1234', comicId: 'eh:123456:abcdef1234', title: 'Fixture', alternateTitles: ['別名'], author: 'Artist', authors: ['Artist'], circle: 'Circle', description: '', chineseTeam: '', categories: ['Doujinshi'], tags: ['tag'], canonicalTags: [], completionStatus: 'UNKNOWN', pagesCount: 12, epsCount: 1, rating: 4.5, providerMetadata: { rawTags: ['artist:Artist'] } }], details: async () => { throw new Error('unused') }, episodes: async () => [], pages: async () => [], fetchPage: async () => { throw new Error('unused') }, fetchCover: async () => { throw new Error('unused') } } as unknown as EhProvider\n    const service = new ProviderService(async () => ({} as Pica), db, fakeEh)\n    const records = await service.search({ keyword: 'tag', limit: 10 }, ['eh'], 'recommendations')\n    expect(records[0]).toMatchObject({ providerId: 'eh', completionStatus: 'UNKNOWN', rating: 4.5 })\n    expect(db.getComic('eh:123456:abcdef1234')).toMatchObject({ providerId: 'eh', providerRemoteId: '123456:abcdef1234', completionStatus: 'UNKNOWN', rating: 4.5 })\n    expect(db.reconcileLibraryCounts().provenanceGroups.recommendation).toBe(1)\n    db.close()\n  })\n\n  it('keeps Pica and E-H candidates in the same neutral retriever pool', async () => {\n    const pica = stored('pica-candidate', 'pica')\n    const eh = stored('eh:123456:abcdef1234', 'eh')\n    const result = await retrieveCandidatesV3({ provider: { keyword: async (query) => query === 'mixed' ? [pica, eh] : [], author: async () => [], related: async () => [] }, routes: [{ routeId: 'intent:KEYWORD:0', parentIntentId: 'intent', family: 'SEMANTIC_ANCHOR', routeType: 'KEYWORD', queryTerm: 'mixed', pageLimit: 1 } as never], intents: [{ intentId: 'intent', type: 'SEMANTIC_ANCHOR' } as never], favoriteIds: new Set() })\n    expect(new Set(result.candidates.map((item) => item.comic.providerId))).toEqual(new Set(['pica', 'eh']))\n  })\n\n  it('wires both Desktop and Android V3 to bounded E-H recall without replacing Pica popularity', () => {\n    const desktop = fs.readFileSync('src/library/service.ts', 'utf8')\n    const mobile = fs.readFileSync('mobile/android-alpha2/app/src/main/java/com/picalibrary/android/NativeRecommendationEngine.java', 'utf8')\n    expect(desktop).toContain('const ehMaxRequests = 4')\n    expect(desktop).toContain("['eh']")\n    expect(desktop).toContain("'recommendations'")\n    expect(mobile).toContain('EH_MAX_REQUESTS=4')\n    expect(mobile).toContain('new EhClient(app)')\n    expect(mobile).toContain('UnifiedEhCatalogSync.mergeAll')\n    expect(mobile).toContain('comic.pagesCount,1,0,0')\n  })\n})\n`
  write(file, content)
}

console.log('EH_V3_UI_PATCH=APPLIED')
