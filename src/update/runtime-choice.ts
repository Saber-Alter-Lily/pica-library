import {
    normalizeRuntimeComposition,
    sameRuntimeComposition,
    type RuntimeComposition
} from '../modules/runtime-composition'
import { fullApplicationAssetName } from './release-assets'

export const RUNTIME_CHOICE_TTL_MS = 15 * 60 * 1000
export interface RuntimeChoiceReceipt {
    kind: 'user-selected-runtime-composition'
    id: string
    from: RuntimeComposition
    to: RuntimeComposition
    sourceSha: string
    sourceVersion: string
    targetSourceSha: string
    targetVersion: string
    archiveName: string
    archiveSha256: string
    validUntil: number
}
export function runtimeChoiceComposition(value: unknown): RuntimeComposition {
    if (value !== 'core' && value !== 'jm')
        throw Error('Select core or jm explicitly')
    return { formatVersion: 1, sourceRuntimes: value === 'jm' ? ['jm'] : [] }
}
function version(value: string) {
    if (!/^\d+\.\d+\.\d+$/.test(value))
        throw Error(
            'Runtime component changes require a stable application version'
        )
    const parts = value.split('.').map(Number)
    if (parts.some((part) => !Number.isSafeInteger(part)))
        throw Error('Invalid stable application version')
    return parts
}
export function validateRuntimeChoiceVersion(current: string, target: string) {
    const from = version(current),
        to = version(target)
    const difference =
        to
            .map((part, index) => Math.sign(part - from[index]))
            .find((value) => value !== 0) ?? 0
    if (difference < 0)
        throw Error(
            'Runtime component changes cannot downgrade the application'
        )
}
export function validateRuntimeChoiceReceipt(
    value: RuntimeChoiceReceipt,
    input: {
        current: RuntimeComposition
        staged: RuntimeComposition
        sourceSha: string
        targetSourceSha: string
        targetVersion: string
        expectedArchiveSha256?: string
        expectedArchiveName?: string
        now?: number
    }
) {
    const allowed = [
        'kind',
        'id',
        'from',
        'to',
        'sourceSha',
        'sourceVersion',
        'targetSourceSha',
        'targetVersion',
        'archiveName',
        'archiveSha256',
        'validUntil'
    ]
    if (
        !value ||
        typeof value !== 'object' ||
        Array.isArray(value) ||
        Object.keys(value).some((key) => !allowed.includes(key)) ||
        allowed.some((key) => !Object.hasOwn(value, key)) ||
        value.kind !== 'user-selected-runtime-composition' ||
        !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(value.id) ||
        ![value.sourceSha, value.targetSourceSha].every(
            (sha) => typeof sha === 'string' && /^[a-f0-9]{40}$/.test(sha)
        ) ||
        !/^[a-f0-9]{64}$/.test(value.archiveSha256)
    )
        throw Error('Invalid explicit runtime component consent')
    const now = input.now ?? Date.now()
    if (
        !Number.isSafeInteger(value.validUntil) ||
        value.validUntil <= now ||
        value.validUntil > now + RUNTIME_CHOICE_TTL_MS
    )
        throw Error(
            'Runtime component consent expired; preview and confirm again'
        )
    const from = normalizeRuntimeComposition(value.from),
        to = normalizeRuntimeComposition(value.to)
    if (
        sameRuntimeComposition(from, to) ||
        !sameRuntimeComposition(from, input.current) ||
        !sameRuntimeComposition(to, input.staged)
    )
        throw Error('Runtime component choice changed after confirmation')
    validateRuntimeChoiceVersion(value.sourceVersion, value.targetVersion)
    if (
        value.sourceSha !== input.sourceSha ||
        value.targetSourceSha !== input.targetSourceSha ||
        value.targetVersion !== input.targetVersion ||
        (value.sourceVersion === value.targetVersion &&
            value.sourceSha !== value.targetSourceSha) ||
        value.archiveName !==
            fullApplicationAssetName(
                value.targetVersion,
                { platform: 'windows', arch: 'x64' },
                to
            ) ||
        (input.expectedArchiveName !== undefined &&
            value.archiveName !== input.expectedArchiveName) ||
        (input.expectedArchiveSha256 !== undefined &&
            value.archiveSha256 !== input.expectedArchiveSha256)
    )
        throw Error(
            'Runtime component consent no longer matches the verified application'
        )
}
