import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import AdmZip from 'adm-zip'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LibraryDatabase } from '../../src/library/database'
import { LibraryService } from '../../src/library/service'
import { RecommendationPolicyStoreV5 } from '../../src/recommendation-v5/policy-store'
import { RECOMMENDATION_V5_POLICY_STATE_KEY } from '../../src/recommendation-v5/portable-policy'
import { defaultTagPolicyV1 } from '../../src/recommendation-v5/tag-policy'
import { TagProfileExchangeV1 } from '../../src/recommendation-v5/tag-profile-exchange'

const cleanups: Array<() => void> = []
afterEach(() =>
    cleanups
        .splice(0)
        .reverse()
        .forEach((run) => run())
)
const privateId = 'pt_' + '1'.repeat(32)
function fixture(manual = false) {
    const dir = fs.mkdtempSync(
        path.join(os.tmpdir(), 'pica-tag-exchange-fixture-')
    )
    cleanups.push(() => fs.rmSync(dir, { recursive: true, force: true }))
    const db = new LibraryDatabase(path.join(dir, 'library.db'))
    cleanups.push(() => db.close())
    db.importFavorites(
        [
            {
                comicId: 'secret-work-id',
                title: 'PRIVATE_WORK_TITLE',
                author: 'Creator',
                tags: ['School', 'Watercolor'],
                categories: [],
                finished: true
            }
        ],
        'fixture'
    )
    const store = new RecommendationPolicyStoreV5(db)
    if (manual)
        store.setTagPolicy({
            baseRevision: 0,
            tagPolicy: {
                ...defaultTagPolicyV1(),
                privateTags: [
                    {
                        id: privateId,
                        name: 'Personal annotation',
                        kind: 'MANUAL',
                        comicIds: ['secret-work-id'],
                        mappings: []
                    }
                ]
            }
        })
    const service = new LibraryService(db, dir),
        exchange = service.tagProfileExchangeV1()
    return { db, store, service, exchange, dir }
}
function exported(exchange: TagProfileExchangeV1, options = {}) {
    const zip = new AdmZip(exchange.exportPackage(options).buffer)
    return {
        zip,
        template: JSON.parse(zip.readAsText('edit_template.json')),
        profile: JSON.parse(zip.readAsText('current_profile.json')),
        catalog: JSON.parse(zip.readAsText('tag_catalog.json'))
    }
}
const preview = (
    exchange: TagProfileExchangeV1,
    template: unknown,
    changes: unknown[]
) => exchange.preview(JSON.stringify({ ...(template as object), changes }))
describe('AI tag-profile exchange (synthetic state only)', () => {
    it('exports strict instructions and defaults to no work IDs/titles or favorite counts', () => {
        const { exchange, db } = fixture(true),
            before = db.getAppState(RECOMMENDATION_V5_POLICY_STATE_KEY),
            value = exported(exchange)
        expect(value.zip.getEntries().map((e) => e.entryName)).toEqual(
            expect.arrayContaining([
                'FORMAT.md',
                'tag_catalog.json',
                'current_profile.json',
                'edit_template.json',
                'SHA256SUMS.txt'
            ])
        )
        const all = value.zip
            .getEntries()
            .map((e) => value.zip.readAsText(e))
            .join('\n')
        expect(all).not.toContain('PRIVATE_WORK_TITLE')
        expect(all).not.toContain('secret-work-id')
        expect(all).not.toContain('favoriteWorkCount')
        expect(value.profile.privateTags[0]).toMatchObject({
            bindingsExported: false
        })
        expect(JSON.parse(value.zip.readAsText('manifest.json')).format).toBe(
            'PICA_TAG_PROFILE_EXPORT'
        )
        expect(db.getAppState(RECOMMENDATION_V5_POLICY_STATE_KEY)).toEqual(
            before
        )
    })
    it('requires explicit opt-in for counts and manual work catalog', () => {
        const { exchange } = fixture(true),
            value = exported(exchange, {
                includeFavoriteCounts: true,
                includeManualBindings: true
            })
        expect(value.catalog.tags[0].favoriteWorkCount).toBe(1)
        expect(value.zip.readAsText('work_catalog.json')).toContain(
            'PRIVATE_WORK_TITLE'
        )
        expect(value.profile.privateTags[0].comicIds).toEqual([
            'secret-work-id'
        ])
        expect(() =>
            exchange.exportPackage({ includeFavoriteCounts: 'true' })
        ).toThrow('BOOLEAN')
    })
    it('previews without writing settings or modifying original facts; applies and undoes atomically', () => {
        const { exchange, db, service } = fixture(),
            { template } = exported(exchange),
            fact = db.getComic('secret-work-id'),
            write = vi.spyOn(db, 'setAppState')
        const p = preview(exchange, template, [
            { op: 'set_mode', mode: 'SELECTED' },
            { op: 'set_participation', ids: ['pica|school'], enabled: true },
            {
                op: 'create_private',
                ref: 'label1',
                kind: 'MAPPED',
                name: 'My lines',
                mappings: ['pica|watercolor'],
                enabled: true
            }
        ])
        expect(write).not.toHaveBeenCalled()
        expect(p.changed).toBe(true)
        expect(p.details.length).toBeGreaterThan(0)
        exchange.apply(p.previewId)
        expect(
            service.recommendationTagPolicyV1().tagPolicy.selected
        ).toContain('pica|school')
        expect(exchange.status().canUndo).toBe(true)
        expect(
            service.recommendationTagPolicyV1().tagPolicy.privateTags[0].id
        ).toMatch(/^pt_[a-f0-9]{32}$/)
        expect(exchange.apply(p.previewId).alreadyApplied).toBe(true)
        exchange.undo()
        expect(service.recommendationTagPolicyV1().tagPolicy).toEqual(
            defaultTagPolicyV1()
        )
        expect(db.getComic('secret-work-id')).toEqual(fact)
        expect(() => exchange.apply(p.previewId)).toThrow('ALREADY_UNDONE')
        expect(() => exchange.undo()).toThrow('NO_UNDO')
    })
    it('rejects unknown or namespace-guessed IDs and every unsupported mutation before any save', () => {
        const { exchange, db } = fixture(),
            { template } = exported(exchange)
        for (const changes of [
            [{ op: 'set_participation', ids: ['eh|school'], enabled: true }],
            [{ op: 'execute', script: 'anything' }],
            [
                {
                    op: 'set_participation',
                    ids: ['pica|school'],
                    enabled: true,
                    sql: 'DROP'
                }
            ],
            [{ op: 'set_mode', mode: 'OFF' }]
        ])
            expect(() => preview(exchange, template, changes)).toThrow()
        expect(
            db.getAppState(RECOMMENDATION_V5_POLICY_STATE_KEY)
        ).toBeUndefined()
        expect(() =>
            exchange.preview(JSON.stringify({ ...template, hardBlocks: [] }))
        ).toThrow('FIELD')
        expect(() => exchange.preview('PK archive')).toThrow('JSON_ONLY')
        expect(() => exchange.preview(' '.repeat(1024 * 1024 + 1))).toThrow(
            'TOO_LARGE'
        )
    })
    it('does not trust hashes supplied by AI or accept another installation’s export', () => {
        const { exchange } = fixture(),
            { template } = exported(exchange)
        expect(() =>
            preview(exchange, { ...template, baseDigest: 'fake' }, [])
        ).toThrow('MISMATCH')
        expect(() =>
            preview(
                exchange,
                { ...template, exportId: 'other-installation' },
                []
            )
        ).toThrow('NOT_LOCAL')
    })
    it('rejects the whole file when any later operation fails, including duplicate/mixed bindings', () => {
        const { exchange, db } = fixture(),
            { template } = exported(exchange)
        expect(() =>
            preview(exchange, template, [
                { op: 'set_mode', mode: 'SELECTED' },
                { op: 'set_participation', ids: ['unknown'], enabled: true }
            ])
        ).toThrow()
        expect(() =>
            preview(exchange, template, [
                {
                    op: 'set_participation',
                    ids: ['pica|school', 'pica|school'],
                    enabled: true
                }
            ])
        ).toThrow('DUPLICATE')
        expect(() =>
            preview(exchange, template, [
                {
                    op: 'create_private',
                    ref: 'a',
                    kind: 'MAPPED',
                    name: 'Bad',
                    mappings: ['pica|school'],
                    comicIds: [],
                    enabled: true
                }
            ])
        ).toThrow('MIXED')
        expect(
            db.getAppState(RECOMMENDATION_V5_POLICY_STATE_KEY)
        ).toBeUndefined()
    })
    it('manual binding edits are forbidden without permission from the locally retained export', () => {
        const { exchange, service } = fixture(true),
            { template } = exported(exchange)
        expect(() =>
            preview(exchange, template, [
                { op: 'update_private', id: privateId, comicIds: [] }
            ])
        ).toThrow('NOT_EXPORTED')
        const p = preview(exchange, template, [
            { op: 'update_private', id: privateId, name: 'Renamed' }
        ])
        exchange.apply(p.previewId)
        expect(
            service.recommendationTagPolicyV1().tagPolicy.privateTags[0]
                .comicIds
        ).toEqual(['secret-work-id'])
        const allowed = exported(exchange, { includeManualBindings: true })
        const q = preview(exchange, allowed.template, [
            { op: 'update_private', id: privateId, comicIds: [] }
        ])
        exchange.apply(q.previewId)
        expect(
            service.recommendationTagPolicyV1().tagPolicy.privateTags[0]
                .comicIds
        ).toEqual([])
    })
    it('retains the export through app restart but never trusts an old preview ID after restart', () => {
        const { exchange, service, db } = fixture(),
            { template } = exported(exchange),
            p = preview(exchange, template, [
                { op: 'set_mode', mode: 'SELECTED' }
            ])
        const restarted = new LibraryService(db, '.').tagProfileExchangeV1()
        expect(() => restarted.apply(p.previewId)).toThrow('REPREVIEW')
        expect(
            preview(restarted, template, [{ op: 'set_mode', mode: 'SELECTED' }])
                .changed
        ).toBe(true)
        expect(service.recommendationTagPolicyV1().revision).toBe(0)
    })
    it('blocks stale exports, apply races and undo over newer paired/local preferences', () => {
        const { exchange, store } = fixture(),
            { template } = exported(exchange),
            p = preview(exchange, template, [
                { op: 'set_mode', mode: 'SELECTED' }
            ])
        store.setTagPolicy({
            baseRevision: 0,
            tagPolicy: { ...defaultTagPolicyV1(), disabled: ['pica|school'] }
        })
        expect(() => exchange.apply(p.previewId)).toThrow('NEWER_EDITS')
        expect(() => preview(exchange, template, [])).toThrow('NEWER_EDITS')
        const next = exported(exchange),
            q = preview(exchange, next.template, [
                { op: 'set_mode', mode: 'SELECTED' }
            ])
        exchange.apply(q.previewId)
        store.setTagPolicy({
            baseRevision: store.state().revision,
            tagPolicy: defaultTagPolicyV1()
        })
        expect(() => exchange.undo()).toThrow('NEWER_EDITS')
        expect(exchange.status().canUndo).toBe(false)
    })
    it('rolls back both policy and undo metadata if the second atomic write fails', () => {
        const { exchange, db } = fixture(),
            { template } = exported(exchange),
            p = preview(exchange, template, [
                { op: 'set_mode', mode: 'SELECTED' }
            ]),
            original = db.setAppState.bind(db)
        const spy = vi
            .spyOn(db, 'setAppState')
            .mockImplementation((key, value) => {
                if (key === 'recommendation_tag_profile_undo_v1')
                    throw new Error('synthetic disk error')
                return original(key, value)
            })
        expect(() => exchange.apply(p.previewId)).toThrow(
            'synthetic disk error'
        )
        spy.mockRestore()
        expect(
            db.getAppState(RECOMMENDATION_V5_POLICY_STATE_KEY)
        ).toBeUndefined()
        expect(exchange.status().canUndo).toBe(false)
        expect(exchange.apply(p.previewId).changed).toBe(true)
    })
    it('keeps baseline-digest validation, empty templates and time/retention limits explicit', () => {
        const { exchange, db, service } = fixture(),
            { template } = exported(exchange)
        const empty = preview(exchange, template, [])
        expect(empty.changed).toBe(false)
        exchange.apply(empty.previewId)
        expect(service.recommendationTagPolicyV1().revision).toBe(0)
        let now = Date.now()
        const timed = new TagProfileExchangeV1(
            db,
            () => service.recommendationTagPolicyV1(),
            () => service.recommendationTagPolicyV1(),
            () => now
        )
        const old = exported(timed)
        now += 31 * 86400000
        expect(() => preview(timed, old.template, [])).toThrow('EXPIRED')
        const first = exported(timed)
        for (let i = 0; i < 4; i++) exported(timed)
        expect(() => preview(timed, first.template, [])).toThrow('NOT_LOCAL')
    })
})
