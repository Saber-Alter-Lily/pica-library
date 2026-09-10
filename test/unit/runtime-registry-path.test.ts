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
const manifest = 'PICA_REGISTRY_V3_FINAL_MANIFEST.json'

afterEach(() => {
    for (const directory of directories.splice(0))
        fs.rmSync(directory, { recursive: true, force: true })
})

describe('Registry V3 runtime path', () => {
    it('prefers the source-compatible package path', () => {
        const primary = create()
        const packaged = create()
        fs.writeFileSync(path.join(primary, manifest), '{}')
        fs.writeFileSync(path.join(packaged, manifest), '{}')
        expect(runtimeRegistryDirectory(primary, packaged)).toBe(primary)
    })

    it('uses the app mirror installed by a v0.3.0 incremental updater', () => {
        const primary = create()
        const packaged = create()
        fs.writeFileSync(path.join(packaged, manifest), '{}')
        expect(runtimeRegistryDirectory(primary, packaged)).toBe(packaged)
    })

    it('keeps the original authority path for missing-asset diagnostics', () => {
        const primary = create()
        expect(runtimeRegistryDirectory(primary, create())).toBe(primary)
    })
})
