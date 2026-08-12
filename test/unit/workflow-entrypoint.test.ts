import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(import.meta.dirname, '../..')
const read = (relativePath: string) =>
    fs.readFileSync(path.join(root, relativePath), 'utf8')

describe('built CLI entrypoint contract', () => {
    it('keeps package and Rollup output aligned', () => {
        const packageJson = JSON.parse(read('package.json')) as {
            bin: Record<string, string>
        }
        const rollup = read('rollup.config.js')

        expect(packageJson.bin['pica-library']).toBe('dist/pica-library.js')
        expect(rollup).toContain("'pica-library': 'src/library-cli.ts'")
        expect(rollup).toContain("entryFileNames: '[name].js'")
    })

    it('uses the canonical built CLI in runtime automation', () => {
        const runtimeFiles = [
            '.github/workflows/download.yml',
            '.github/workflows/prepare-library.yml',
            'scripts/setup-windows.ps1'
        ]

        for (const relativePath of runtimeFiles) {
            const content = read(relativePath)
            expect(content, relativePath).not.toContain('dist/library-cli.js')
            expect(content, relativePath).toContain('dist/pica-library.js')
        }

        const downloadWorkflow = read('.github/workflows/download.yml')
        expect(downloadWorkflow).toContain('--runner GITHUB')
    })
})
