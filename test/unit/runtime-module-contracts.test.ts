import { describe, expect, it } from 'vitest'
import { appCapabilities } from '../../src/app-capabilities'
import {
    normalizeModuleContracts,
    parseModuleContracts,
    runtimeModuleContracts,
    sameModuleContracts
} from '../../src/modules/contracts'
import { classifyUpdateCompatibility } from '../../src/update/compatibility'
import * as tags from '../../src/tags/policy'
import * as legacy from '../../src/recommendation-v5/tag-policy'

describe('local-first runtime module contracts', () => {
    it('publishes public interface versions without content, user state or credentials', () => {
        const contract = runtimeModuleContracts()
        expect(contract).toEqual({
            formatVersion: 1,
            apis: {
                library: 2,
                reader: 1,
                sources: 1,
                tags: 2,
                recommendation: 5,
                sync: 1,
                update: 1
            }
        })
        expect(appCapabilities().moduleContracts).toEqual(contract)
        contract.apis.tags = 99
        expect(runtimeModuleContracts().apis.tags).toBe(2)
    })
    it('keeps tag entry points byte-schema and function compatible without owning recommendation state', () => {
        expect(legacy.normalizeTagPolicyV1).toBe(tags.normalizeTagPolicyV1)
        expect(legacy.projectComicTagSignalsV1).toBe(
            tags.projectComicTagSignalsV1
        )
        expect(tags.TAG_POLICY_SCHEMA_VERSION).toBe(1)
        expect(tags.normalizeTagPolicyV1()).toEqual(legacy.defaultTagPolicyV1())
    })
    it('rejects incomplete, executable-looking, unknown-format and invalid versions', () => {
        for (const invalid of [
            null,
            [],
            {},
            { ...runtimeModuleContracts(), formatVersion: 2 },
            {
                ...runtimeModuleContracts(),
                load: 'https://example.test/plugin.js'
            },
            { formatVersion: 1, apis: { tags: 1 } },
            {
                ...runtimeModuleContracts(),
                apis: { ...runtimeModuleContracts().apis, tags: '1' }
            },
            {
                ...runtimeModuleContracts(),
                apis: { ...runtimeModuleContracts().apis, '../evil': 1 }
            }
        ])
            expect(() => normalizeModuleContracts(invalid)).toThrow()
        expect(() => parseModuleContracts('{')).toThrow(/JSON/)
        expect(() => parseModuleContracts(' '.repeat(32769))).toThrow(/limit/)
    })
    it('requires one-click full replacement for each incompatible module, not a mixed incremental tree', () => {
        const base = {
            currentAppApiVersion: 2,
            targetAppApiVersion: 2,
            currentDatabaseSchemaVersion: 14,
            targetDatabaseSchemaVersion: 14,
            currentModuleContracts: runtimeModuleContracts()
        }
        expect(
            classifyUpdateCompatibility({
                ...base,
                targetModuleContracts: runtimeModuleContracts()
            })
        ).toEqual({ kind: 'INCREMENTAL', reason: 'COMPATIBLE' })
        for (const id of Object.keys(runtimeModuleContracts().apis)) {
            const target = runtimeModuleContracts()
            target.apis[id]++
            expect(
                classifyUpdateCompatibility({
                    ...base,
                    targetModuleContracts: target
                })
            ).toEqual({
                kind: 'FULL_APPLICATION',
                reason: 'MODULE_API_CHANGED'
            })
        }
        expect(
            classifyUpdateCompatibility({
                ...base,
                targetDatabaseSchemaVersion: 13,
                targetModuleContracts: runtimeModuleContracts()
            }).kind
        ).toBe('UNSUPPORTED')
    })
    it('compares normalized contracts independent of JSON key ordering, leaving legacy manifests readable', () => {
        const contract = runtimeModuleContracts()
        expect(
            sameModuleContracts(contract, {
                formatVersion: 1,
                apis: Object.fromEntries(
                    Object.entries(contract.apis).reverse()
                )
            })
        ).toBe(true)
        expect(
            classifyUpdateCompatibility({
                currentAppApiVersion: 2,
                targetAppApiVersion: 2,
                currentDatabaseSchemaVersion: 14,
                targetDatabaseSchemaVersion: 14
            }).kind
        ).toBe('INCREMENTAL')
    })
})
