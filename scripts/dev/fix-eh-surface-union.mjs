import fs from 'node:fs'

function replaceOne(path,before,after,label){let text=fs.readFileSync(path,'utf8');const first=text.indexOf(before);if(first<0)throw new Error(`missing ${label}`);if(text.indexOf(before,first+before.length)>=0)throw new Error(`duplicate ${label}`);fs.writeFileSync(path,text.slice(0,first)+after+text.slice(first+before.length))}

replaceOne(
  'src/services/provider-service.ts',
`        return [
            ...new Map(records.map((record) => [record.comicId, record])).values()
        ]`,
`        const consolidated = new Map<string, FavoriteRecord>()
        for (const record of records) {
            const previous = consolidated.get(record.comicId)
            if (!previous) {
                consolidated.set(record.comicId, record)
                continue
            }
            if (previous.providerId === 'eh' && record.providerId === 'eh') {
                const previousMetadata = previous.providerMetadata ?? {}
                const nextMetadata = record.providerMetadata ?? {}
                const knownSurfaces = new Set<string>([
                    ...(Array.isArray(previousMetadata.knownSurfaces)
                        ? previousMetadata.knownSurfaces.map(String)
                        : []),
                    ...(Array.isArray(nextMetadata.knownSurfaces)
                        ? nextMetadata.knownSurfaces.map(String)
                        : []),
                    String(previousMetadata.preferredSurface ?? ''),
                    String(nextMetadata.preferredSurface ?? '')
                ])
                consolidated.set(record.comicId, {
                    ...previous,
                    ...record,
                    providerMetadata: {
                        ...previousMetadata,
                        ...nextMetadata,
                        knownSurfaces: [...knownSurfaces].filter(
                            (surface) => surface === 'eh' || surface === 'exh'
                        )
                    }
                })
                continue
            }
            consolidated.set(record.comicId, record)
        }
        const result = [...consolidated.values()]
        const surfaceMerged = result.filter(
            (record) =>
                record.providerId === 'eh' &&
                Array.isArray(record.providerMetadata?.knownSurfaces) &&
                record.providerMetadata.knownSurfaces.length > 1
        )
        if (surfaceMerged.length)
            this.database.importCatalog(
                surfaceMerged,
                'eh:surface-merge:' + provenance
            )
        return result`,
  'provider search surface union'
)

const testPath='test/unit/eh-cross-source-v3.test.ts'
let test=fs.readFileSync(testPath,'utf8')
const close='\n})\n'
if(!test.endsWith(close))throw new Error('cross-source suite close not found')
const addition=`\n  it('unions E-H and ExH bindings when both surfaces return the same canonical gallery', async () => {\n    const db = database()\n    const fakeEh = { id: 'eh', capabilities: {}, search: async (input: { surface?: string }) => [{ providerId: 'eh', providerRemoteId: '456789:abcdef1234', comicId: 'eh:456789:abcdef1234', title: 'Shared Gallery', alternateTitles: [], author: 'Artist', authors: ['Artist'], circle: null, description: '', chineseTeam: '', categories: ['Manga'], tags: ['tag'], canonicalTags: [], completionStatus: 'UNKNOWN', pagesCount: 12, epsCount: 1, rating: 4.9, providerMetadata: { rawTags: [], preferredSurface: input.surface, knownSurfaces: [input.surface] } }], details: async () => { throw new Error('unused') }, episodes: async () => [], pages: async () => [], fetchPage: async () => { throw new Error('unused') }, fetchCover: async () => { throw new Error('unused') } } as unknown as EhProvider\n    const service = new ProviderService(async () => ({} as Pica), db, fakeEh)\n    const records = await service.search({ keyword: 'tag', limit: 10 }, ['eh', 'exh'], 'discover')\n    expect(records).toHaveLength(1)\n    expect([...(records[0].providerMetadata?.knownSurfaces as string[])].sort()).toEqual(['eh', 'exh'])\n    const stored = db.getComic('eh:456789:abcdef1234')\n    expect([...(stored?.providerMetadata?.knownSurfaces as string[])].sort()).toEqual(['eh', 'exh'])\n    expect(stored?.providerId).toBe('eh')\n    db.close()\n  })\n`
test=test.slice(0,-close.length)+addition+close
fs.writeFileSync(testPath,test)
console.log('EH_SURFACE_UNION_FIX=APPLIED')
