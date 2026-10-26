import type AdmZip from 'adm-zip'
import { MODULE_CONTRACT_PATH, parseModuleContracts } from '../modules/contracts'
import { compositionFromPayload, RUNTIME_COMPOSITION_PATH } from '../modules/runtime-composition'

export const requiredFullApplicationFiles = [
    'Pica Library.exe', 'runtime/node.exe', 'app/desktop.js',
    'app/updater.js', 'app/full-upgrader.js', 'SOURCE_SHA.txt'
] as const

const forbiddenFullPackageRoot =
    /^(?:config|data|cache|downloads?|logs?|runtime-state|packs)(?:\/|$)|\.(?:db|sqlite)(?:-|$)/i

export function normalizeFullPackagePath(value: string) {
    const raw = String(value ?? '').replaceAll('\\', '/')
    if (!raw || raw.startsWith('/') || raw.startsWith('//') || /^[a-z]:/i.test(raw) || raw.includes(':'))
        throw new Error('Full application package path is unsafe')
    const segments = raw.split('/')
    if (segments.some(segment => !segment || segment === '.' || segment === '..' || /[. ]$/.test(segment)))
        throw new Error('Full application package path is unsafe')
    return segments.join('/')
}

/** Existing updater policy, shared unchanged with the read-only migration preview. */
export function validateFullApplicationArchive(zip: AdmZip) {
    const entries = zip.getEntries().filter(entry => !entry.isDirectory)
    const declared = new Map<string, (typeof entries)[number]>()
    for (const entry of entries) {
        const safe = normalizeFullPackagePath(entry.entryName)
        if (safe.toLowerCase() === MODULE_CONTRACT_PATH && safe !== MODULE_CONTRACT_PATH)
            throw new Error('Runtime module payload must use the canonical path case')
        if (forbiddenFullPackageRoot.test(safe))
            throw new Error('User data is forbidden in full application packages: ' + safe)
        if (declared.has(safe)) throw new Error('Duplicate full application path: ' + safe)
        declared.set(safe, entry)
    }
    for (const required of requiredFullApplicationFiles)
        if (!declared.has(required)) throw new Error('Full application package is incomplete: ' + required)
    const sourceSha = declared.get('SOURCE_SHA.txt')!.getData().toString('utf8').trim()
    if (!/^[0-9a-f]{40}$/.test(sourceSha)) throw new Error('Full application SOURCE_SHA.txt is invalid')
    const moduleEntry = declared.get(MODULE_CONTRACT_PATH)
    if (moduleEntry) parseModuleContracts(moduleEntry.getData().toString('utf8'))
    const composition = compositionFromPayload(declared.keys(), declared.get(RUNTIME_COMPOSITION_PATH)?.getData().toString('utf8'))
    return { declared, sourceSha, composition }
}
