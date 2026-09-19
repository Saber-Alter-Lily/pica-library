import { describe, expect, it } from 'vitest'
import {
    DATABASE_SCHEMA_VERSION,
    appCapabilities
} from '../../src/app-capabilities'
import { latestMigrationVersion } from '../../src/storage/sqlite/migrations'

describe('database schema authority', () => {
    it('derives updater/capabilities schema from the actual migration set', () => {
        expect(latestMigrationVersion).toBeGreaterThanOrEqual(13)
        expect(DATABASE_SCHEMA_VERSION).toBe(latestMigrationVersion)
        expect(appCapabilities().databaseSchemaVersion).toBe(
            latestMigrationVersion
        )
    })
})
