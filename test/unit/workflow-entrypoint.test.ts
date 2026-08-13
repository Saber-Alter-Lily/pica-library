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

    it('scopes provider secrets to provider steps and protects all artifacts', () => {
        const workflows = fs
            .readdirSync(path.join(root, '.github/workflows'))
            .filter((name) => /\.ya?ml$/.test(name))
        for (const name of workflows) {
            const content = read(`.github/workflows/${name}`)
            expect(content, name).not.toMatch(
                /jobs:\s*[\s\S]*?runs-on:[^\n]*\n\s+env:\s*\n\s+PICA_(ACCOUNT|PASSWORD):/
            )
            if (content.includes('upload-artifact@')) {
                expect(content, name).toContain('retention-days: 1')
                expect(content, name).toContain(
                    'github.event.repository.private'
                )
            }
        }
        const prepared = read('.github/workflows/prepare-library.yml')
        const reusable = read('.github/workflows/private-download.yml')
        expect(prepared).toContain("== 'true' ]] ||")
        expect(prepared).toContain('PICA_ACCOUNT_PRESENT')
        expect(reusable).toContain('PICA_ACCOUNT_PRESENT')
    })

    it('keeps recommendation diagnostics out of the default UI', () => {
        const app = read('web/app.js')
        const renderer = app.slice(
            app.indexOf('function renderResultCards'),
            app.indexOf('function downloadJson')
        )
        expect(renderer).not.toContain('item.reasons')
        expect(renderer).not.toContain('item.score')
        expect(renderer).not.toContain('matchedSignals')
        expect(renderer).not.toContain('state.profile?.')
        expect(app).toMatch(
            /function renderAll[\s\S]*renderPreparedRecommendations\(\)/
        )
    })
})
