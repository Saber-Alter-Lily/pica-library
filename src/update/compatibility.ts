export type UpdateCompatibilityKind =
    | 'INCREMENTAL'
    | 'FULL_APPLICATION'
    | 'UNSUPPORTED'

export interface UpdateCompatibilityInput {
    currentAppApiVersion: number
    currentDatabaseSchemaVersion: number
    targetAppApiVersion: number
    targetDatabaseSchemaVersion: number
    updaterHelperChanged?: boolean
}

export interface UpdateCompatibilityDecision {
    kind: UpdateCompatibilityKind
    reason:
        | 'COMPATIBLE'
        | 'APP_API_CHANGED'
        | 'SCHEMA_JUMP'
        | 'SCHEMA_DOWNGRADE'
        | 'UPDATER_HELPER_CHANGED'
}

export function classifyUpdateCompatibility(
    input: UpdateCompatibilityInput
): UpdateCompatibilityDecision {
    if (
        !Number.isInteger(input.currentAppApiVersion) ||
        !Number.isInteger(input.targetAppApiVersion) ||
        !Number.isInteger(input.currentDatabaseSchemaVersion) ||
        !Number.isInteger(input.targetDatabaseSchemaVersion) ||
        input.currentAppApiVersion < 1 ||
        input.targetAppApiVersion < 1 ||
        input.currentDatabaseSchemaVersion < 1 ||
        input.targetDatabaseSchemaVersion < 1
    )
        throw new Error('Invalid update compatibility versions')

    if (
        input.targetDatabaseSchemaVersion <
        input.currentDatabaseSchemaVersion
    )
        return {
            kind: 'UNSUPPORTED',
            reason: 'SCHEMA_DOWNGRADE'
        }

    if (input.updaterHelperChanged)
        return {
            kind: 'FULL_APPLICATION',
            reason: 'UPDATER_HELPER_CHANGED'
        }

    if (input.targetAppApiVersion !== input.currentAppApiVersion)
        return {
            kind: 'FULL_APPLICATION',
            reason: 'APP_API_CHANGED'
        }

    if (
        input.targetDatabaseSchemaVersion >
        input.currentDatabaseSchemaVersion + 1
    )
        return {
            kind: 'FULL_APPLICATION',
            reason: 'SCHEMA_JUMP'
        }

    return {
        kind: 'INCREMENTAL',
        reason: 'COMPATIBLE'
    }
}
