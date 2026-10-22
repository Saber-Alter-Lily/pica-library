import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LibraryDatabase } from '../../src/library/database'
import { LibraryService } from '../../src/library/service'
import type { StoredComic } from '../../src/library/types'
import { RecommendationPolicyStoreV5 } from '../../src/recommendation-v5/policy-store'
import { defaultPortablePolicyStateV5, RECOMMENDATION_V5_POLICY_STATE_KEY } from '../../src/recommendation-v5/portable-policy'
import { defaultTagPolicyV1, normalizeTagPolicyV1, privateTagSignalV1 } from '../../src/recommendation-v5/tag-policy'
import { applyIntentPolicyV5 } from '../../src/recommendation-v5/intent-policy'
import { restrictTagIntentsV1, inferredPrivateTagIntentsV1 } from '../../src/recommendation-v5/tag-intents'
import { translateIntentPlanV3 } from '../../src/recommendation-v3/provider-query-translator'
import { buildPreferenceTimescalesV5 } from '../../src/recommendation-v5/preference-timescales'
import { buildCandidateChannelPlanV5 } from '../../src/recommendation-v5/candidate-channels'
import { compileCandidateProviderRoutesV5 } from '../../src/recommendation-v5/provider-query-compiler'
import type { RecommendationIntentV3 } from '../../src/recommendation-v3/intent-planner-v3'

const cleanup: Array<() => void> = []
afterEach(() => { cleanup.splice(0).reverse().forEach(fn => fn()) })
function fixture() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-tag-synthetic-'))
    cleanup.push(() => fs.rmSync(dir, { recursive: true, force: true }))
    const database = new LibraryDatabase(path.join(dir, 'library.db')); cleanup.push(() => database.close())
    return { dir, database, store: new RecommendationPolicyStoreV5(database) }
}
const off = () => ({ ...defaultTagPolicyV1(), mode: 'SELECTED' as const })
const comic = (id: string, tags: string[]) => ({ comicId: id, providerId: id.startsWith('eh:') ? 'eh' : 'pica', title: id, author: 'Author', categories: ['Manga'], tags, isFavorite: true } as StoredComic)
const intent = (key = 'school'): RecommendationIntentV3 => ({ intentId: key, type: 'SEMANTIC_ANCHOR', anchors: [{ canonicalKey: key, canonicalLabel: key, providerQueryLabel: key, facet: 'GENRE_THEME', recommendationEligible: true, retrievalUtility: 'STANDARD' }], sourceLayer: 'LIFETIME', evidence: { supportCount: 1, supportShare: 1, confidence: 'LOW' }, retrieval: { providerEligible: true, utilityTier: 'STANDARD', estimatedRouteCost: 1 }, planning: { familyRank: 1, recentUseCount: 0, lastUsedAt: null, exploration: false }, explanation: { reasonCode: 'TEST', shortReason: key } })
const privateId = 'pt_' + '3'.repeat(32)
describe('tag policy storage, routes and paired knowledge contract', () => {
    it('directory GET does not initialize a policy, annotate works or modify objective data', () => {
        const { database, dir, store } = fixture()
        database.importFavorites([{ comicId: 'synthetic', title: 'Synthetic', author: 'Author', tags: ['School'], categories: [], finished: true }], 'test')
        const before = JSON.stringify(database.getComic('synthetic')), write = vi.spyOn(database, 'setAppState')
        const service = new LibraryService(database, dir), directory = service.recommendationTagPolicyV1()
        expect(directory.revision).toBe(0);expect(directory.directorySource).toBe('LOCAL_OBSERVED_METADATA');expect(directory.rows[0].supportCount).toBe(1)
        expect(write).not.toHaveBeenCalled();expect(JSON.stringify(database.getComic('synthetic'))).toBe(before)
        expect(() => store.setTagPolicy({ tagPolicy: off(), baseRevision: undefined })).toThrow()
        expect(database.getAppState(RECOMMENDATION_V5_POLICY_STATE_KEY)).toBeUndefined()
    })
    it('preserves legacy controls, policy version and unrelated state on first tag save', () => {
        const { database, store } = fixture(), legacy = defaultPortablePolicyStateV5(); delete legacy.tagPolicy
        legacy.seenComicIds = ['known']; legacy.revision = 9
        database.setAppState(RECOMMENDATION_V5_POLICY_STATE_KEY, legacy)
        const value = store.setTagPolicy({ tagPolicy: off(), baseRevision: 9 })
        expect(value.revision).toBe(10); expect(value.seenComicIds).toEqual(['known']); expect(value.policyVersion).toBe(legacy.policyVersion)
        const before = JSON.stringify(store.state())
        expect(() => store.setTagPolicy({ tagPolicy: defaultTagPolicyV1(), baseRevision: 9 })).toThrow('REVISION_CONFLICT')
        expect(() => store.setTagPolicy({ tagPolicy: undefined, baseRevision: 10 })).toThrow()
        expect(JSON.stringify(store.state())).toBe(before)
    })
    it('does not apply feedback, controls or item facts on an unresolved whole-scheme conflict', () => {
        const { store } = fixture();store.setTagPolicy({ tagPolicy: off(), baseRevision: 0 })
        const baseline = defaultTagPolicyV1(), android = { ...baseline, disabled: ['eh|other'] }, before = JSON.stringify(store.state())
        const input = { deviceId: 'synthetic-phone', mutationId: 'm1', syncSchemaVersion: 1, baseTagPolicy: baseline, tagPolicy: android, suppressComicIds: ['must-not-apply'] }
        expect(store.previewMobile(input)).toMatchObject({ hasPortableChanges: true, tagPolicyConflict: { identity: 'TAG_POLICY_V1' } })
        expect(store.mergeMobile(input).requiresResolution).toBe(true);expect(JSON.stringify(store.state())).toBe(before)
        expect(store.mergeMobile({ ...input, resolutions: [{ identity: 'TAG_POLICY_V1', choice: 'ANDROID' }] }).requiresResolution).toBe(false)
        expect(store.state().tagPolicy).toEqual(android);expect(store.state().hardSuppressComicIds).toContain('must-not-apply')
    })
    it('old clients omitting tag fields do not reset new settings', () => {
        const { store } = fixture();store.setTagPolicy({ tagPolicy: off(), baseRevision: 0 });store.mergeMobile({ deviceId: 'legacy', mutationId: 'old' })
        expect(store.state().tagPolicy).toEqual(off())
    })
    it('all-off removes raw tag routes but retains independent creator/related paths', () => {
        const state = { ...defaultPortablePolicyStateV5(), tagPolicy: off() }
        const creator = { ...intent('author'), type: 'CREATOR' as const }, related = { ...intent('seed'), type: 'RELATED' as const }
        expect(restrictTagIntentsV1([intent(), creator, related], state, []).map(i => i.type)).toEqual(['CREATOR', 'RELATED'])
        expect(buildPreferenceTimescalesV5([], [comic('pica:1', ['school'])], state).layers.inferred.lifetime.positive.tags).toEqual([])
    })
    it('matches a selected raw alias without re-enabling the same label on another provider', () => {
        const state = { ...defaultPortablePolicyStateV5(), tagPolicy: { ...off(), selected: ['pica|school alias'] } }
        const routes = translateIntentPlanV3(restrictTagIntentsV1([intent('canonical')], state, [comic('pica:1', ['School Alias'])], raw => raw.toLowerCase() === 'school alias' ? 'canonical' : raw))
        expect(routes).toHaveLength(1);expect(routes[0].allowedProviders).toEqual(['pica'])
    })
    it('mapped private recall uses original terms and exact provider scope, never alias names or IDs', () => {
        const tagPolicy = normalizeTagPolicyV1({ ...off(), selected: ['private|' + privateId], privateTags: [{ id: privateId, name: 'My Secret Alias', kind: 'MAPPED', comicIds: [], mappings: ['pica|school', 'eh|female:schoolgirl'] }] })
        const state = { ...defaultPortablePolicyStateV5(), tagPolicy, controls: [{ targetType: 'TAG' as const, key: privateTagSignalV1(privateId), label: 'My Secret Alias', direction: 'MORE' as const, scope: 'PERSISTENT' as const, source: 'DESKTOP' as const, updatedAt: '' }] }
        const routes = translateIntentPlanV3(applyIntentPolicyV5([], state))
        expect(routes.map(r => [r.queryTerm, r.allowedProviders])).toEqual([['female:schoolgirl', ['eh']], ['school', ['pica']]])
        const catalog = [comic('pica:1', ['school'])], timescales = buildPreferenceTimescalesV5([], catalog, state)
        const channels = buildCandidateChannelPlanV5({ catalog, policy: state, timescales })
        expect(channels.channels.filter(c => c.anchors.some(a => a.key.startsWith('@private/'))).every(c => c.providerAllocations.every(a => a.surface === 'local'))).toBe(true)
        expect(compileCandidateProviderRoutesV5(channels).routes.some(r => r.surface === 'local' && r.localCandidateIds?.includes('pica:1'))).toBe(true)
    })
    it('manual labels do not claim an automatic style classifier and have no arbitrary keyword route', () => {
        const tagPolicy = normalizeTagPolicyV1({ ...off(), selected: ['private|' + privateId], privateTags: [{ id: privateId, name: 'My art style', kind: 'MANUAL', comicIds: ['pica:1'], mappings: [] }] })
        const intents = inferredPrivateTagIntentsV1([comic('pica:1', [])], { tagPolicy })
        expect(intents[0].type).toBe('RELATED');expect(translateIntentPlanV3(intents)[0]).toMatchObject({ routeType: 'RELATED', comicSeedId: 'pica:1' })
        expect(translateIntentPlanV3(intents)[0].queryTerm).toBeUndefined()
    })
})
