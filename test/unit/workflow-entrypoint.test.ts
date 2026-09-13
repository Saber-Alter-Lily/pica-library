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

    it('keeps stable product version surfaces bound to package metadata', () => {
        const packageJson = JSON.parse(read('package.json')) as {
            version: string
        }
        const version = read('src/version.ts')
        const cli = read('src/library-cli.ts')
        const server = read('src/library/server.ts')

        expect(packageJson.version).toMatch(/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/)
        expect(version).toContain("from '../package.json'")
        expect(version).toContain('export const PRODUCT_VERSION')
        expect(cli).toContain('pica-library ${PRODUCT_VERSION}')
        expect(read('src/library/bundle-export.ts')).toContain(
            'version: PRODUCT_VERSION'
        )
        expect(server).toContain('version: PRODUCT_VERSION')
    })

    it('lets recommendation sessions own the audited bounded session size', () => {
        const app = read('web/app.js')
        expect(app).toContain("post('/api/v1/recommendation-sessions', {})")
        const service = read('src/services/recommendation-service.ts')
        expect(service).toContain('static readonly sessionSize = 60')
        expect(service).toContain('static readonly batchSize = 12')
        expect(read('src/library/server.ts')).toContain(
            'seedCount: Number(input.seedCount ?? 12)'
        )
    })

    it('uses the canonical built CLI in runtime automation', () => {
        const runtimeFiles = ['scripts/setup-windows.ps1']

        for (const relativePath of runtimeFiles) {
            const content = read(relativePath)
            expect(content, relativePath).not.toContain('dist/library-cli.js')
            expect(content, relativePath).toContain('dist/pica-library.js')
        }

        expect(read('src/library-cli.ts')).toContain(
            "['LOCAL', 'GITHUB'].includes(runner)"
        )
    })

    it('keeps retired provider workflows absent and current CI read-only', () => {
        // Current main intentionally ships validation CI, not the former private census/download runners.
        for (const file of [
            'download.yml',
            'private-download.yml',
            'prepare-library.yml'
        ])
            expect(
                fs.existsSync(path.join(root, '.github/workflows', file))
            ).toBe(false)
        const ci = read('.github/workflows/ci.yml')
        expect(ci).toContain('contents: read')
        expect(ci).toContain('pull_request:')
        expect(ci).not.toContain('workflow_call:')
        expect(ci).not.toMatch(
            /secrets\.PICA_(ACCOUNT|PASSWORD|SOURCE_TOKEN|SOURCE_SSH_KEY)/
        )
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
                if (name === 'windows-package.yml') {
                    expect(content, name).not.toMatch(
                        /secrets\.PICA_(ACCOUNT|PASSWORD)/
                    )
                    expect(content, name).toContain('-SetupPersistence')
                } else if (name === 'onboarding-candidate.yml') {
                    // Distributable APKs are public build output, not provider/user data.
                    // Signing material must remain in runner temp, never in the artifact.
                    expect(content).toContain('contents: read')
                    expect(content).toContain(
                        'branches: [codex/account-onboarding-web-reader]'
                    )
                    expect(content).not.toMatch(/pull_request(?:_target)?:/)
                    expect(content).toContain(
                        'path: mobile/android-alpha2/candidate/'
                    )
                    expect(content).toContain('if-no-files-found: error')
                    expect(content).toContain(
                        'mktemp -d "$RUNNER_TEMP/pica-signing-XXXXXXXX"'
                    )
                    expect(content).toContain(
                        '64fb87dc7d8bd6bc7b2cec92cc8c83fad3afe8cfb07591a2e53d53cbd3ab2f9d'
                    )
                    expect(content).not.toMatch(
                        /contents: write|gh release|git tag/
                    )
                } else {
                    expect(content, name).toContain(
                        'github.event.repository.private'
                    )
                }
            }
        }
        for (const name of workflows)
            expect(read(`.github/workflows/${name}`), name).not.toMatch(
                /secrets\.PICA_(ACCOUNT|PASSWORD)/
            )
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

    it('stores semantic Browser Lite author evidence for live language switching', () => {
        const app = read('web/app.js')
        const authorState = read('web/author-state.js')
        expect(app).toContain('deriveLiteAuthors(state.records, normalize)')
        expect(authorState).toContain('evidenceKey: match')
        expect(authorState).toContain("'author.evidence.circlePattern'")
        expect(authorState).toContain("'author.evidence.normalized'")
        expect(app).toContain('localizeAuthorEvidence(language, author)')
        expect(app).not.toContain('检测到“社团（作者）”格式，请确认作者实体。')
        expect(app).not.toContain('规范化名称一致。')
        expect(app).not.toContain("|| '未知作者'")
    })
})
