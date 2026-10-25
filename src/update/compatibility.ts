import {
    normalizeModuleContracts,
    sameModuleContracts,
    type RuntimeModuleContracts
} from '../modules/contracts'
import { normalizeRuntimeComposition, sameRuntimeComposition, type RuntimeComposition } from '../modules/runtime-composition'

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
    currentModuleContracts?: RuntimeModuleContracts
    targetModuleContracts?: RuntimeModuleContracts
    currentRuntimeComposition?: RuntimeComposition
    targetRuntimeComposition?: RuntimeComposition
}

export interface UpdateCompatibilityDecision {
    kind: UpdateCompatibilityKind
    reason:
        | 'COMPATIBLE'
        | 'APP_API_CHANGED'
        | 'SCHEMA_JUMP'
        | 'SCHEMA_DOWNGRADE'
        | 'UPDATER_HELPER_CHANGED'
        | 'MODULE_API_CHANGED'
        | 'RUNTIME_COMPOSITION_CHANGED'
}

export function classifyUpdateCompatibility(
    input: UpdateCompatibilityInput
): UpdateCompatibilityDecision {
    const currentModules =
        input.currentModuleContracts === undefined
            ? undefined
            : normalizeModuleContracts(input.currentModuleContracts)
    const targetModules =
        input.targetModuleContracts === undefined
            ? undefined
            : normalizeModuleContracts(input.targetModuleContracts)
    const currentComposition = input.currentRuntimeComposition === undefined ? undefined : normalizeRuntimeComposition(input.currentRuntimeComposition)
    const targetComposition = input.targetRuntimeComposition === undefined ? undefined : normalizeRuntimeComposition(input.targetRuntimeComposition)
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

    if (input.targetDatabaseSchemaVersion < input.currentDatabaseSchemaVersion)
        return {
            kind: 'UNSUPPORTED',
            reason: 'SCHEMA_DOWNGRADE'
        }

    if (input.updaterHelperChanged)
        return {
            kind: 'FULL_APPLICATION',
            reason: 'UPDATER_HELPER_CHANGED'
        }

    if (currentComposition && targetComposition && !sameRuntimeComposition(currentComposition, targetComposition))
        return { kind: 'FULL_APPLICATION', reason: 'RUNTIME_COMPOSITION_CHANGED' }

    if (input.targetAppApiVersion !== input.currentAppApiVersion)
        return {
            kind: 'FULL_APPLICATION',
            reason: 'APP_API_CHANGED'
        }

    if (
        currentModules &&
        targetModules &&
        !sameModuleContracts(currentModules, targetModules)
    )
        return { kind: 'FULL_APPLICATION', reason: 'MODULE_API_CHANGED' }

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
