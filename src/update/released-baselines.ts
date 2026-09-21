export interface ReleasedUpdateBaseline {
    version: string
    appApiVersion: number
    advertisedDatabaseSchemaVersion: number
    actualMigrationVersion: number
    notes?: string
}

export const RELEASED_UPDATE_BASELINES: Record<
    string,
    ReleasedUpdateBaseline
> = {
    '0.4.0': {
        version: '0.4.0',
        appApiVersion: 2,
        advertisedDatabaseSchemaVersion: 8,
        actualMigrationVersion: 9,
        notes:
            'Public v0.4.0 migrated through schema 9 but shipped a stale capabilities constant of 8.'
    },
    '0.4.1': {
        version: '0.4.1',
        appApiVersion: 2,
        advertisedDatabaseSchemaVersion: 13,
        actualMigrationVersion: 13,
        notes:
            'Public v0.4.1 is the clean schema-13/updater baseline for scoped incremental updates.'
    },
    '0.4.2': {
        version: '0.4.2',
        appApiVersion: 2,
        advertisedDatabaseSchemaVersion: 13,
        actualMigrationVersion: 13,
        notes:
            'Public v0.4.2 keeps the schema-13 updater contract and is a compatible scoped-update baseline.'
    },
    '0.4.3': {
        version: '0.4.3',
        appApiVersion: 2,
        advertisedDatabaseSchemaVersion: 13,
        actualMigrationVersion: 13,
        notes:
            'Public v0.4.3 keeps the schema-13 updater contract and is a compatible scoped-update baseline.'
    },
    '0.4.4': {
        version: '0.4.4',
        appApiVersion: 2,
        advertisedDatabaseSchemaVersion: 13,
        actualMigrationVersion: 13,
        notes:
            'Public v0.4.4 keeps the schema-13 updater contract and is a compatible scoped-update baseline.'
    },
    '0.4.5': {
        version: '0.4.5',
        appApiVersion: 2,
        advertisedDatabaseSchemaVersion: 13,
        actualMigrationVersion: 13,
        notes:
            'Public v0.4.5 keeps the schema-13 updater contract and is a compatible scoped-update baseline.'
    }
}

export function releasedUpdateBaseline(version: string) {
    return RELEASED_UPDATE_BASELINES[version] ?? null
}
