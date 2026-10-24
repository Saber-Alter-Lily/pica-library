import { describe, expect, it } from 'vitest'
import type { StoredComic } from '../../src/library/types'
import { buildTagDirectoryV1, defaultTagPolicyV1, normalizeTagPolicyV1, previewTagPolicyMergeV1, privateTagSignalV1, projectComicTagSignalsV1, tagPoliciesEqualV1 } from '../../src/recommendation-v5/tag-policy'
import { collectPortableInferredSignalsV5, defaultPortablePolicyStateV5, normalizeControlV5, preferenceAdjustmentV5 } from '../../src/recommendation-v5/portable-policy'

const manualId = 'pt_' + '1'.repeat(32), mappedId = 'pt_' + '2'.repeat(32)
const comic = (id: string, tags = ['School'], favorite = true) => ({ comicId: id, providerId: id.startsWith('eh:') ? 'eh' : 'pica', tags, author: 'Creator', categories: ['Manga'], isFavorite: favorite } as StoredComic)
const selected = () => ({ ...defaultTagPolicyV1(), mode: 'SELECTED' as const, selected: ['pica|school'] })
const privatePolicy = () => normalizeTagPolicyV1({ ...selected(), selected: ['private|' + manualId, 'private|' + mappedId], privateTags: [
    { id: manualId, name: 'My soft lines', kind: 'MANUAL', comicIds: ['pica:1'], mappings: [] },
    { id: mappedId, name: 'My school', kind: 'MAPPED', comicIds: [], mappings: ['pica|school', 'eh|female:schoolgirl'] }
] })

describe('Personal tag participation: immutable facts and provider-scoped signals', () => {
    it('legacy defaults preserve raw tag participation', () => {
        expect(projectComicTagSignalsV1(comic('pica:1'), {}).tags).toEqual(['School'])
        expect(tagPoliciesEqualV1(undefined, defaultTagPolicyV1())).toBe(true)
    })
    it('all-off stops tags, not comics/authors/categories; exact provider identities do not leak', () => {
        const raw = comic('pica:1')
        const off = projectComicTagSignalsV1(raw, { tagPolicy: { ...selected(), selected: [] } })
        expect(off.tags).toEqual([]); expect(off.comicId).toBe(raw.comicId); expect(off.author).toBe('Creator')
        expect(raw.tags).toEqual(['School'])
        expect(projectComicTagSignalsV1(comic('eh:1'), { tagPolicy: selected() }).tags).toEqual([])
        expect(projectComicTagSignalsV1(comic('pica:1', ['School', 'New tag']), { tagPolicy: selected() }).tags).toEqual(['School'])
    })
    it('supports manual bindings and ANY provider mappings without rewriting raw metadata', () => {
        const state = { tagPolicy: privatePolicy() }
        expect(projectComicTagSignalsV1(comic('pica:1'), state).tags).toEqual([privateTagSignalV1(manualId), privateTagSignalV1(mappedId)])
        expect(projectComicTagSignalsV1(comic('eh:2', ['female:schoolgirl']), state).tags).toEqual([privateTagSignalV1(mappedId)])
        expect(projectComicTagSignalsV1(comic('eh:2', ['School']), state).tags).toEqual([])
        expect(projectComicTagSignalsV1(comic('pica:2', ['@private/' + manualId]), state).tags).toEqual([])
    })
    it('rejects unknown versions, mixed binding modes, oversized or cyclic private tags', () => {
        expect(() => normalizeTagPolicyV1({ ...selected(), schemaVersion: 2 })).toThrow()
        expect(() => normalizeTagPolicyV1({ ...privatePolicy(), privateTags: [{ ...privatePolicy().privateTags[0], mappings: ['pica|school'] }] })).toThrow()
        expect(() => normalizeTagPolicyV1({ ...privatePolicy(), privateTags: [{ ...privatePolicy().privateTags[1], mappings: ['private|' + manualId] }] })).toThrow()
        expect(() => normalizeTagPolicyV1({ ...selected(), selected: Array(4097).fill('pica|school') })).toThrow()
    })
    it('groups coverage counts from unique favorites, not a fabricated liking score', () => {
        const rows = buildTagDirectoryV1([comic('pica:1'), comic('pica:1'), comic('pica:2', ['Other'], false)], {}, () => 'TOPIC')
        expect(rows.map(r => [r.key, r.supportCount, r.catalogCount])).toEqual([['school', 1, 1], ['other', 0, 1]])
    })
    it('uses lossless EH raw namespaces while leaving flat display metadata untouched', () => {
        const female = { ...comic('eh:1', ['schoolgirl']), providerMetadata: { rawTags: ['female:schoolgirl'] } }, male = { ...comic('eh:2', ['schoolgirl']), providerMetadata: { rawTags: ['male:schoolgirl'] } }
        const state = { ...defaultPortablePolicyStateV5(), tagPolicy: { ...selected(), selected: ['eh|female:schoolgirl'] }, controls: [normalizeControlV5({ targetType: 'TAG', key: 'schoolgirl', label: 'Schoolgirl', direction: 'MORE', scope: 'PERSISTENT', source: 'DESKTOP', updatedAt: '' })] }
        expect(buildTagDirectoryV1([female, male], state).map(r => r.identity).sort()).toEqual(['eh|female:schoolgirl', 'eh|male:schoolgirl'])
        expect(projectComicTagSignalsV1(female, state).tags).toEqual(['schoolgirl']);expect(projectComicTagSignalsV1(male, state).tags).toEqual([])
        expect(preferenceAdjustmentV5(female, state).adjustment).toBeGreaterThan(0);expect(preferenceAdjustmentV5(male, state).adjustment).toBe(0)
        expect(female.tags).toEqual(['schoolgirl']);expect(female.providerMetadata.rawTags).toEqual(['female:schoolgirl'])
    })
    it('gates inferred and explicit taste but never bypasses raw hard BLOCK', () => {
        const state = { ...defaultPortablePolicyStateV5(), tagPolicy: { ...selected(), selected: [] }, controls: [normalizeControlV5({ targetType: 'TAG', key: 'school', label: 'School', direction: 'MORE', scope: 'PERSISTENT', source: 'DESKTOP', updatedAt: '' })] }
        expect(preferenceAdjustmentV5(comic('pica:1'), state).adjustment).toBe(0)
        expect(collectPortableInferredSignalsV5([comic('pica:1')], [], state).some(r => r.targetType === 'TAG')).toBe(false)
        expect(preferenceAdjustmentV5(comic('pica:1'), { ...state, controls: [{ ...state.controls[0], direction: 'BLOCK' }] }).blocked).toBe(true)
        const privateState = { ...state, tagPolicy: privatePolicy(), controls: [{ ...state.controls[0], key: privateTagSignalV1(manualId), label: 'My soft lines' }] }
        expect(preferenceAdjustmentV5(comic('pica:1'), privateState).adjustment).toBeGreaterThan(0)
        expect(collectPortableInferredSignalsV5([comic('pica:1')], [], privateState).find(r => r.key === privateTagSignalV1(manualId))?.label).toBe('My soft lines')
    })
    it('merges three ways, keeps old clients harmless, and requires an explicit conflict choice', () => {
        const base = defaultTagPolicyV1(), desktop = selected(), android = privatePolicy()
        expect(previewTagPolicyMergeV1(desktop, undefined, undefined).next).toEqual(desktop)
        expect(previewTagPolicyMergeV1(desktop, base, android).conflict?.identity).toBe('TAG_POLICY_V1')
        expect(previewTagPolicyMergeV1(desktop, base, android, 'ANDROID').next).toEqual(android)
        expect(previewTagPolicyMergeV1(desktop, base, android, 'DESKTOP').next).toEqual(desktop)
        expect(previewTagPolicyMergeV1(desktop, base, base).next).toEqual(desktop)
        expect(previewTagPolicyMergeV1(base, base, android).next).toEqual(android)
    })
})
