import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { afterEach, describe, expect, it } from 'vitest'

const roots: string[] = []
afterEach(() => {
    for (const root of roots.splice(0))
        fs.rmSync(root, { recursive: true, force: true })
})

describe('P2-K K1 Windows reference evidence kit', () => {
    it('runs the deterministic Desktop matrix and keeps real-account work opt-in', () => {
        const script = fs.readFileSync(
            'scripts/benchmark/run-p2k-windows-reference.ps1',
            'utf8'
        )
        for (const id of [
            'J3_DESKTOP_STARTUP',
            'J4_BROWSER_HOME_LIBRARY',
            'J5_DETAIL_SHELF_READER',
            'J6_READER_LONG_SESSION',
            'J7A_RECOMMENDATION_BATCH',
            'J8_ACTIVE_DOWNLOAD',
            'J9_WEBDAV',
            'J11_OVERLAP'
        ])
            expect(script).toContain(id)

        expect(script).toContain('[switch]$IncludeVisual')
        expect(script).toContain('--allow-model-network')
        expect(script).not.toContain(
            'run-desktop-recommendation-generation-harness.mjs'
        )
        expect(script).not.toContain('--confirm-regeneration=YES')
    })

    it('blocks dirty-tree evidence unless explicitly acknowledged', () => {
        const script = fs.readFileSync(
            'scripts/benchmark/run-p2k-windows-reference.ps1',
            'utf8'
        )
        expect(script).toContain('[switch]$AllowDirty')
        expect(script).toContain('git status --porcelain')
        expect(script).toContain('dirty evidence cannot be promoted silently')
        expect(script).toContain('PROCESSOR_ARCHITECTURE')
        expect(script).toContain('PROCESSOR_ARCHITEW6432')
        expect(script).toContain('requires Windows x64/AMD64')
        expect(script).not.toContain('$IsWindows')
        expect(script).not.toContain('GetRelativePath')
    })

    it('builds a hashed machine-readable evidence manifest without budgets', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'p2k-manifest-test-'))
        roots.push(root)
        const commit = 'a'.repeat(40)
        fs.writeFileSync(
            path.join(root, 'environment.json'),
            JSON.stringify({ schemaVersion: 1, commit, dirty: false })
        )
        fs.writeFileSync(
            path.join(root, 'run-status.json'),
            JSON.stringify({
                schemaVersion: 1,
                commit,
                dirty: false,
                runs: [
                    {
                        id: 'J3',
                        output: 'j3.json',
                        outputExists: true,
                        exitCode: 0
                    }
                ]
            })
        )
        fs.writeFileSync(
            path.join(root, 'j3.json'),
            JSON.stringify({ schemaVersion: 1, benchmark: 'fixture-j3' })
        )

        const result = spawnSync(
            process.execPath,
            [
                'scripts/benchmark/build-p2k-evidence-manifest.mjs',
                `--root=${root}`,
                `--commit=${commit}`
            ],
            { encoding: 'utf8' }
        )
        expect(result.status).toBe(0)
        const manifest = JSON.parse(
            fs.readFileSync(path.join(root, 'p2k-evidence-manifest.json'), 'utf8')
        )
        expect(manifest.complete).toBe(true)
        expect(manifest.budgetSelected).toBe(false)
        expect(manifest.concurrencyCapacitySelected).toBe(false)
        expect(manifest.files).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    path: 'j3.json',
                    sha256: expect.stringMatching(/^[0-9a-f]{64}$/)
                })
            ])
        )
    })
})
