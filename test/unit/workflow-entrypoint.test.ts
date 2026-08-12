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
            '.github/workflows/private-download.yml',
            '.github/workflows/prepare-library.yml',
            'scripts/setup-windows.ps1'
        ]

        for (const relativePath of runtimeFiles) {
            const content = read(relativePath)
            expect(content, relativePath).not.toContain('dist/library-cli.js')
            expect(content, relativePath).toContain('dist/pica-library.js')
        }

        const downloadWorkflow = read('.github/workflows/private-download.yml')
        expect(downloadWorkflow).toContain('--runner GITHUB')
    })

    it('fails closed for public callers and checks out the pinned engine', () => {
        const wrapper = read('.github/workflows/download.yml')
        const reusable = read('.github/workflows/private-download.yml')
        expect(wrapper).toContain(
            'uses: ./.github/workflows/private-download.yml'
        )
        expect(reusable).toContain('workflow_call:')
        expect(reusable).toContain('github.event.repository.private')
        expect(reusable).toContain("!= 'true'")
        expect(reusable).toContain('repository: ${{ job.workflow_repository }}')
        expect(reusable).toContain('ref: ${{ job.workflow_sha }}')
        expect(reusable).toContain(
            'token: ${{ secrets.PICA_SOURCE_TOKEN || github.token }}'
        )
        expect(reusable).toContain(
            'ssh-key: ${{ secrets.PICA_SOURCE_SSH_KEY }}'
        )
        expect(reusable).toContain('persist-credentials: false')
        expect(reusable).toContain('retention-days: 1')
    })
})
