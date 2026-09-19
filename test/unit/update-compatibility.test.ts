import { describe, expect, it } from 'vitest'
import { classifyUpdateCompatibility } from '../../src/update/compatibility'

const current = {
    currentAppApiVersion: 2,
    currentDatabaseSchemaVersion: 13
}

describe('update compatibility decision matrix', () => {
    it('allows the same schema or one additive schema step incrementally', () => {
        expect(
            classifyUpdateCompatibility({
                ...current,
                targetAppApiVersion: 2,
                targetDatabaseSchemaVersion: 13
            })
        ).toEqual({ kind: 'INCREMENTAL', reason: 'COMPATIBLE' })

        expect(
            classifyUpdateCompatibility({
                ...current,
                targetAppApiVersion: 2,
                targetDatabaseSchemaVersion: 14
            })
        ).toEqual({ kind: 'INCREMENTAL', reason: 'COMPATIBLE' })
    })

    it('requires a full application replacement for API change, large schema jump or updater helper change', () => {
        expect(
            classifyUpdateCompatibility({
                ...current,
                targetAppApiVersion: 3,
                targetDatabaseSchemaVersion: 13
            })
        ).toEqual({ kind: 'FULL_APPLICATION', reason: 'APP_API_CHANGED' })

        expect(
            classifyUpdateCompatibility({
                ...current,
                targetAppApiVersion: 2,
                targetDatabaseSchemaVersion: 15
            })
        ).toEqual({ kind: 'FULL_APPLICATION', reason: 'SCHEMA_JUMP' })

        expect(
            classifyUpdateCompatibility({
                ...current,
                targetAppApiVersion: 2,
                targetDatabaseSchemaVersion: 13,
                updaterHelperChanged: true
            })
        ).toEqual({
            kind: 'FULL_APPLICATION',
            reason: 'UPDATER_HELPER_CHANGED'
        })
    })

    it('rejects database schema downgrade even when application files could be replaced', () => {
        expect(
            classifyUpdateCompatibility({
                ...current,
                targetAppApiVersion: 2,
                targetDatabaseSchemaVersion: 12
            })
        ).toEqual({ kind: 'UNSUPPORTED', reason: 'SCHEMA_DOWNGRADE' })
    })

    it('models the shipped v0.4 updater declaration honestly', () => {
        expect(
            classifyUpdateCompatibility({
                currentAppApiVersion: 2,
                currentDatabaseSchemaVersion: 8,
                targetAppApiVersion: 2,
                targetDatabaseSchemaVersion: 9
            })
        ).toEqual({ kind: 'INCREMENTAL', reason: 'COMPATIBLE' })

        expect(
            classifyUpdateCompatibility({
                currentAppApiVersion: 2,
                currentDatabaseSchemaVersion: 8,
                targetAppApiVersion: 2,
                targetDatabaseSchemaVersion: 13
            })
        ).toEqual({ kind: 'FULL_APPLICATION', reason: 'SCHEMA_JUMP' })
    })
})
