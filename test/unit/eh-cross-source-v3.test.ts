import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { LibraryDatabase } from '../../src/library/database'
import { ProviderService } from '../../src/services/provider-service'
import { retrieveCandidatesV3 } from '../../src/recommendation-v3/retriever-v3'
import type { Pica } from '../../src/sdk'
import type { StoredComic } from '../../src/library/types'
import type { EhProvider } from '../../src/providers/eh-provider'

const dirs: string[] = []
afterEach(() => { for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true }) })
function database() { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-eh-v3-')); dirs.push(dir); return new LibraryDatabase(path.join(dir, 'library.db')) }
function stored(comicId: string, providerId: 'pica' | 'eh'): StoredComic { return { comicId, providerId, providerRemoteId: providerId === 'eh' ? comicId.slice(3) : comicId, title: comicId, author: 'Creator', categories: ['Category'], tags: ['tag'], finished: false, completionStatus: providerId === 'eh' ? 'UNKNOWN' : 'ONGOING', canonicalAuthor: 'Creator', circle: null, authorId: null, isFavorite: false, firstSeenAt: '2026-01-01T00:00:00.000Z', lastSeenAt: '2026-01-01T00:00:00.000Z', knownEpisodes: 0, knownPictures: 0, downloadedPictures: 0 } }

describe('E-H cross-source Recommendation V3', () => {
  it('persists E-H provider identity through ProviderService recommendation search', async () => {
    const db = database()
    const fakeEh = { id: 'eh', capabilities: {}, search: async () => [{ providerId: 'eh', providerRemoteId: '123456:abcdef1234', comicId: 'eh:123456:abcdef1234', title: 'Fixture', alternateTitles: ['別名'], author: 'Artist', authors: ['Artist'], circle: 'Circle', description: '', chineseTeam: '', categories: ['Doujinshi'], tags: ['tag'], canonicalTags: [], completionStatus: 'UNKNOWN', pagesCount: 12, epsCount: 1, rating: 4.5, providerMetadata: { rawTags: ['artist:Artist'] } }], details: async () => { throw new Error('unused') }, episodes: async () => [], pages: async () => [], fetchPage: async () => { throw new Error('unused') }, fetchCover: async () => { throw new Error('unused') } } as unknown as EhProvider
    const service = new ProviderService(async () => ({} as Pica), db, fakeEh)
    const records = await service.search({ keyword: 'tag', limit: 10 }, ['eh'], 'recommendations')
    expect(records[0]).toMatchObject({ providerId: 'eh', completionStatus: 'UNKNOWN', rating: 4.5 })
    expect(db.getComic('eh:123456:abcdef1234')).toMatchObject({ providerId: 'eh', providerRemoteId: '123456:abcdef1234', completionStatus: 'UNKNOWN', rating: 4.5 })
    expect(db.reconcileLibraryCounts().provenanceGroups.recommendation).toBe(1)
    db.close()
  })

  it('keeps Pica and E-H candidates in the same neutral retriever pool', async () => {
    const pica = stored('pica-candidate', 'pica')
    const eh = stored('eh:123456:abcdef1234', 'eh')
    const result = await retrieveCandidatesV3({ provider: { keyword: async (query) => query === 'mixed' ? [pica, eh] : [], author: async () => [], related: async () => [] }, routes: [{ routeId: 'intent:KEYWORD:0', parentIntentId: 'intent', family: 'SEMANTIC_ANCHOR', routeType: 'KEYWORD', queryTerm: 'mixed', pageLimit: 1 } as never], intents: [{ intentId: 'intent', type: 'SEMANTIC_ANCHOR' } as never], favoriteIds: new Set() })
    expect(new Set(result.candidates.map((item) => item.comic.providerId))).toEqual(new Set(['pica', 'eh']))
  })

  it('wires both Desktop and Android V3 to bounded E-H recall without replacing Pica popularity', () => {
    const desktop = fs.readFileSync('src/library/service.ts', 'utf8')
    const mobile = fs.readFileSync('mobile/android-alpha2/app/src/main/java/com/picalibrary/android/NativeRecommendationEngine.java', 'utf8')
    expect(desktop).toContain("const sourceBudget: Record<'eh' | 'exh', number> = { eh: 4, exh: 2 }")
    expect(desktop).toContain("externalSearch(query, 'keyword', 'eh')")
    expect(desktop).toContain("externalSearch(query, 'keyword', 'exh')")
    expect(desktop).toContain('preferenceSignals')
    expect(desktop).toContain('!dislikedIds.has(comic.comicId)')
    expect(desktop).toContain('comic.isFavorite ||')
    expect(desktop).toContain('likedIds.has(comic.comicId)')
    expect(mobile).toContain('EH_MAX_REQUESTS=4,EXH_MAX_REQUESTS=2')
    expect(mobile).toContain('ehClient.search(q,"eh")')
    expect(mobile).toContain('ehClient.search(q,"exh")')
    expect(mobile).toContain('known.favorite||known.inShelf||known.phoneDownloaded||known.desktopDownloaded||known.remoteAvailable')
  })
  it('routes ExH through the E-H provider while preserving canonical identity', async () => {
    const db = database()
    let observedSurface = ''
    const fakeEh = { id: 'eh', capabilities: {}, search: async (input: { surface?: string }) => { observedSurface = String(input.surface || ''); return [{ providerId: 'eh', providerRemoteId: '234567:abcdef1234', comicId: 'eh:234567:abcdef1234', title: 'ExH Fixture', alternateTitles: [], author: 'Artist', authors: ['Artist'], circle: null, description: '', chineseTeam: '', categories: ['Doujinshi'], tags: ['tag'], canonicalTags: [], completionStatus: 'UNKNOWN', pagesCount: 10, epsCount: 1, rating: 4.8, providerMetadata: { rawTags: [] } }] }, details: async () => { throw new Error('unused') }, episodes: async () => [], pages: async () => [], fetchPage: async () => { throw new Error('unused') }, fetchCover: async () => { throw new Error('unused') } } as unknown as EhProvider
    const service = new ProviderService(async () => ({} as Pica), db, fakeEh)
    const records = await service.search({ keyword: 'tag', limit: 10 }, ['exh'], 'discover')
    expect(observedSurface).toBe('exh')
    expect(records[0]).toMatchObject({ comicId: 'eh:234567:abcdef1234', providerId: 'eh' })
    expect(records[0].providerMetadata).toMatchObject({ preferredSurface: 'exh', knownSurfaces: ['exh'] })
    db.close()
  })

  it('keeps successful sources when ExH is unavailable but fails an explicit ExH-only request', async () => {
    const db = database()
    const fakeEh = { id: 'eh', capabilities: {}, search: async (input: { surface?: string }) => {
      if (input.surface === 'exh') throw new Error('ExH unavailable')
      return [{ providerId: 'eh', providerRemoteId: '345678:abcdef1234', comicId: 'eh:345678:abcdef1234', title: 'Public Fixture', alternateTitles: [], author: 'Artist', authors: ['Artist'], circle: null, description: '', chineseTeam: '', categories: ['Manga'], tags: ['tag'], canonicalTags: [], completionStatus: 'UNKNOWN', pagesCount: 8, epsCount: 1, providerMetadata: { rawTags: [] } }]
    }, details: async () => { throw new Error('unused') }, episodes: async () => [], pages: async () => [], fetchPage: async () => { throw new Error('unused') }, fetchCover: async () => { throw new Error('unused') } } as unknown as EhProvider
    const service = new ProviderService(async () => ({} as Pica), db, fakeEh)
    const mixed = await service.search({ keyword: 'tag', limit: 10 }, ['eh', 'exh'], 'discover')
    expect(mixed.map((item) => item.comicId)).toEqual(['eh:345678:abcdef1234'])
    await expect(service.search({ keyword: 'tag', limit: 10 }, ['exh'], 'discover')).rejects.toThrow('ExH unavailable')
    db.close()
  })

  it('unions E-H and ExH bindings when both surfaces return the same canonical gallery', async () => {
    const db = database()
    const fakeEh = { id: 'eh', capabilities: {}, search: async (input: { surface?: string }) => [{ providerId: 'eh', providerRemoteId: '456789:abcdef1234', comicId: 'eh:456789:abcdef1234', title: 'Shared Gallery', alternateTitles: [], author: 'Artist', authors: ['Artist'], circle: null, description: '', chineseTeam: '', categories: ['Manga'], tags: ['tag'], canonicalTags: [], completionStatus: 'UNKNOWN', pagesCount: 12, epsCount: 1, rating: 4.9, providerMetadata: { rawTags: [], preferredSurface: input.surface, knownSurfaces: [input.surface] } }], details: async () => { throw new Error('unused') }, episodes: async () => [], pages: async () => [], fetchPage: async () => { throw new Error('unused') }, fetchCover: async () => { throw new Error('unused') } } as unknown as EhProvider
    const service = new ProviderService(async () => ({} as Pica), db, fakeEh)
    const records = await service.search({ keyword: 'tag', limit: 10 }, ['eh', 'exh'], 'discover')
    expect(records).toHaveLength(1)
    expect([...(records[0].providerMetadata?.knownSurfaces as string[])].sort()).toEqual(['eh', 'exh'])
    const stored = db.getComic('eh:456789:abcdef1234')
    expect([...(stored?.providerMetadata?.knownSurfaces as string[])].sort()).toEqual(['eh', 'exh'])
    expect(stored?.providerId).toBe('eh')
    db.close()
  })

})
