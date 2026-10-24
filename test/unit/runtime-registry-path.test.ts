import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { runtimeRegistryDirectory } from '../../src/recommendation-v3/runtime-registry-path'

const directories: string[] = []
const create = () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-registry-'))
    directories.push(directory)
    return directory
}
const manifest = 'TAG_RUNTIME_MANIFEST.json'

afterEach(() => {
    for (const directory of directories.splice(0))
        fs.rmSync(directory, { recursive: true, force: true })
})

describe('Registry V3 runtime path', () => {
    it('prefers the minimal source-development assets', () => {
        const primary = create()
        const packaged = create()
        fs.writeFileSync(path.join(primary, manifest), '{}')
        fs.writeFileSync(path.join(packaged, manifest), '{}')
        expect(runtimeRegistryDirectory(primary, packaged)).toBe(primary)
    })

    it('uses the minimal app-only runtime installed by a current updater', () => {
        const primary = create()
        const packaged = create()
        fs.writeFileSync(path.join(packaged, manifest), '{}')
        expect(runtimeRegistryDirectory(primary, packaged)).toBe(packaged)
    })

    it('keeps the original authority path for missing-asset diagnostics', () => {
        const primary = create()
        expect(runtimeRegistryDirectory(primary, create())).toBe(primary)
    })

    it('does not silently select a legacy review-evidence manifest', () => {
        const primary = create(), packaged = create()
        fs.writeFileSync(path.join(packaged, 'PICA_REGISTRY_V3_FINAL_MANIFEST.json'), '{}')
        expect(runtimeRegistryDirectory(primary, packaged)).toBe(primary)
    })
})
