import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildTagDirectoryV1, effectiveTagPolicyV1, normalizeTagPolicyKey, normalizeTagPolicyV1, privateTagForSignalV1, privateTagMatchesV1, projectComicTagSignalsV1, tagControlParticipatesV1, type TagComicV1 } from '../../src/tags/policy'

const fixture = JSON.parse(fs.readFileSync(new URL('../fixtures/tag-policy/golden-v1.json', import.meta.url), 'utf8'))
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value))

describe('shared Desktop/native tag policy normative cases', () => {
    it('uses uniquely named, hand-authored cases and a versioned fixture', () => {
        expect(fixture.schemaVersion).toBe(1)
        expect(new Set(fixture.cases.map((row: {id: string}) => row.id)).size).toBe(fixture.cases.length)
        expect(fixture.cases.length).toBe(44)
    })
    for (const row of fixture.cases) it(row.id, () => {
        const input = clone(fixture.policies[row.policy] ?? null)
        const state = { tagPolicy: normalizeTagPolicyV1(input) }
        const comic = row.comic ? clone(row.comic) as TagComicV1 : undefined
        const before = JSON.stringify({input, comic})
        switch (row.kind) {
            case 'normalize':
                expect(normalizeTagPolicyV1(row.inputPolicy ? clone(fixture.policies[row.inputPolicy]) : clone(row.input))).toEqual(fixture.policies[row.expectedPolicy])
                break
            case 'key': expect(normalizeTagPolicyKey(row.input)).toBe(row.expected); break
            case 'project': expect(projectComicTagSignalsV1(comic!, state, row.includePrivate !== false).tags).toEqual(row.expected); break
            case 'control': expect(!['TAG', 'FANDOM'].includes(row.type) || tagControlParticipatesV1(state, row.key, comic)).toBe(row.expected); break
            case 'match': {
                const tag = privateTagForSignalV1(state, row.key)
                expect(Boolean(tag && privateTagMatchesV1(tag, comic!))).toBe(row.expected)
                break
            }
            case 'invalid': expect(() => normalizeTagPolicyV1(clone(row.input))).toThrow(); break
            case 'invalid-state': expect(() => effectiveTagPolicyV1({tagPolicy: clone(row.input)})).toThrow(); break
            case 'directory':
                expect(buildTagDirectoryV1(clone(row.catalog), state).map(r => ({identity:r.identity,supportCount:r.supportCount,catalogCount:r.catalogCount,enabled:r.enabled})).sort((a,b)=>a.identity < b.identity ? -1 : a.identity > b.identity ? 1 : 0)).toEqual(row.expected)
                break
            default: throw new Error('Uncovered fixture kind: ' + row.kind)
        }
        expect(JSON.stringify({input, comic})).toBe(before)
    })
})
