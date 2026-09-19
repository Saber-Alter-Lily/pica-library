import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import {
    parseEcosystemPackManifest,
    type EcosystemPackManifestV1
} from './pack-manifest'

export type EcosystemPackTrust = 'LOCAL_UNSIGNED'
export type EcosystemPackIntegrity = 'VALID' | 'INVALID'

export interface EcosystemPackInventoryEntry {
    directory: string
    packId: string
    generation: string
    packType?: string
    trust: EcosystemPackTrust
    integrity: EcosystemPackIntegrity
    compatible: boolean
    minimumAppVersion?: string
    contentLicense?: string
    fileCount: number
    byteSize: number
    error?: string
}

function sha256(value: Buffer) {
    return createHash('sha256').update(value).digest('hex')
}

function versionTuple(value: string) {
    const match = String(value ?? '')
        .trim()
        .match(/^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/)
    if (!match) return null
    return [Number(match[1]), Number(match[2]), Number(match[3])] as const
}

export function appVersionSatisfiesMinimum(
    currentVersion: string,
    minimumVersion: string
) {
    const current = versionTuple(currentVersion)
    const minimum = versionTuple(minimumVersion)
    if (!current || !minimum) return false
    for (let index = 0; index < 3; index++) {
        if (current[index] === minimum[index]) continue
        return current[index] > minimum[index]
    }
    return true
}

function listPayloadFiles(root: string) {
    const payload = path.join(root, 'payload')
    if (!fs.existsSync(payload)) return [] as string[]
    const result: string[] = []
    const visit = (directory: string) => {
        for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
            const absolute = path.join(directory, entry.name)
            const stat = fs.lstatSync(absolute)
            if (stat.isSymbolicLink())
                throw new Error('Pack payload may not contain symbolic links')
            if (stat.isDirectory()) {
                visit(absolute)
                continue
            }
            if (!stat.isFile())
                throw new Error('Pack payload contains a non-file entry')
            result.push(
                path.relative(root, absolute).split(path.sep).join('/')
            )
        }
    }
    visit(payload)
    return result.sort((left, right) =>
        left === right ? 0 : left < right ? -1 : 1
    )
}

function verifyPayload(root: string, manifest: EcosystemPackManifestV1) {
    const declared = new Set(manifest.files.map((item) => item.path))
    const actual = listPayloadFiles(root)
    if (
        actual.length !== declared.size ||
        actual.some((item) => !declared.has(item))
    )
        throw new Error('Pack payload files do not match the manifest')

    let byteSize = 0
    for (const item of manifest.files) {
        const absolute = path.resolve(root, ...item.path.split('/'))
        const relative = path.relative(path.resolve(root), absolute)
        if (relative.startsWith('..') || path.isAbsolute(relative))
            throw new Error('Pack payload escaped its generation directory')
        const stat = fs.lstatSync(absolute)
        if (stat.isSymbolicLink() || !stat.isFile())
            throw new Error(`Pack payload is not a regular file: ${item.path}`)
        if (stat.size !== item.size)
            throw new Error(`Pack payload size mismatch: ${item.path}`)
        const digest = sha256(fs.readFileSync(absolute))
        if (digest !== item.sha256)
            throw new Error(`Pack payload SHA-256 mismatch: ${item.path}`)
        byteSize += stat.size
    }
    return byteSize
}

export class EcosystemPackStore {
    constructor(
        private readonly root: string,
        private readonly currentAppVersion: string
    ) {}

    inventory(): EcosystemPackInventoryEntry[] {
        if (!fs.existsSync(this.root)) return []
        const entries: EcosystemPackInventoryEntry[] = []

        for (const packDirectory of fs.readdirSync(this.root, {
            withFileTypes: true
        })) {
            if (!packDirectory.isDirectory()) continue
            const packRoot = path.join(this.root, packDirectory.name)

            for (const generationDirectory of fs.readdirSync(packRoot, {
                withFileTypes: true
            })) {
                if (!generationDirectory.isDirectory()) continue
                const generationRoot = path.join(
                    packRoot,
                    generationDirectory.name
                )
                entries.push(
                    this.inspectGeneration(
                        generationRoot,
                        packDirectory.name,
                        generationDirectory.name
                    )
                )
            }
        }

        return entries.sort((left, right) => {
            const byPack =
                left.packId === right.packId
                    ? 0
                    : left.packId < right.packId
                      ? -1
                      : 1
            if (byPack) return byPack
            return left.generation === right.generation
                ? 0
                : left.generation < right.generation
                  ? -1
                  : 1
        })
    }

    private inspectGeneration(
        generationRoot: string,
        directoryPackId: string,
        directoryGeneration: string
    ): EcosystemPackInventoryEntry {
        const base: EcosystemPackInventoryEntry = {
            directory: generationRoot,
            packId: directoryPackId,
            generation: directoryGeneration,
            trust: 'LOCAL_UNSIGNED',
            integrity: 'INVALID',
            compatible: false,
            fileCount: 0,
            byteSize: 0
        }

        try {
            const manifestFile = path.join(generationRoot, 'pack.json')
            const manifestStat = fs.lstatSync(manifestFile)
            if (manifestStat.isSymbolicLink() || !manifestStat.isFile())
                throw new Error('Pack manifest must be a regular file')

            const manifest = parseEcosystemPackManifest(
                JSON.parse(fs.readFileSync(manifestFile, 'utf8'))
            )
            if (manifest.packId !== directoryPackId)
                throw new Error('Pack ID does not match its directory')
            if (manifest.generation !== directoryGeneration)
                throw new Error('Pack generation does not match its directory')

            const byteSize = verifyPayload(generationRoot, manifest)
            return {
                ...base,
                packId: manifest.packId,
                generation: manifest.generation,
                packType: manifest.packType,
                integrity: 'VALID',
                compatible: appVersionSatisfiesMinimum(
                    this.currentAppVersion,
                    manifest.minimumAppVersion
                ),
                minimumAppVersion: manifest.minimumAppVersion,
                contentLicense: manifest.contentLicense,
                fileCount: manifest.files.length,
                byteSize
            }
        } catch (error) {
            return {
                ...base,
                error: error instanceof Error ? error.message : String(error)
            }
        }
    }
}
