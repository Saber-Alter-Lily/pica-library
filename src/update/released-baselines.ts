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
    }
}

export function releasedUpdateBaseline(version: string) {
    return RELEASED_UPDATE_BASELINES[version] ?? null
}
