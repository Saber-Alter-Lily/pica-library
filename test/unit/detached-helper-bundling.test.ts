import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire, isBuiltin } from 'node:module'
import { spawnSync } from 'node:child_process'
import { rollup, type OutputChunk } from 'rollup'
import { afterEach, describe, expect, it } from 'vitest'

const roots: string[] = []
afterEach(() => {
    for (const root of roots.splice(0))
        fs.rmSync(root, { recursive: true, force: true })
})
// Node loads the real ESM build config. Vite5's URL resolver does not decode
// percent-encoded Windows/Unicode workspace paths correctly.
const configs = () =>
    createRequire(import.meta.url)(path.resolve('rollup.config.js')).default

describe('detached upgrade helper build contract', () => {
    it.each([
        ['updater', 'Updater instruction is required'],
        ['full-upgrader', 'Full-upgrader instruction is required']
    ])(
        'bundles and starts %s with only that file outside the application tree',
        async (name, message) => {
            const config = (await configs()).find(
                (c: { input: Record<string, string> }) => c.input[name]
            )
            expect(config).toBeTruthy()
            const { output: options, ...input } = config,
                bundle = await rollup(input)
            try {
                const { output } = await bundle.generate(options),
                    chunks = output.filter(
                        (x): x is OutputChunk => x.type === 'chunk'
                    )
                expect(chunks).toHaveLength(1)
                expect(chunks[0].imports.every((id) => isBuiltin(id))).toBe(
                    true
                )
                expect(chunks[0].dynamicImports).toEqual([])
                const root = fs.mkdtempSync(
                    path.join(os.tmpdir(), 'pica-standalone-helper-')
                )
                roots.push(root)
                const file = path.join(root, name + '.mjs')
                fs.writeFileSync(file, chunks[0].code)
                const result = spawnSync(process.execPath, [file], {
                    encoding: 'utf8',
                    timeout: 10000,
                    windowsHide: true
                })
                expect(result.status).toBe(1)
                expect(result.stderr).toContain(message)
                expect(result.stderr).not.toContain('ERR_MODULE_NOT_FOUND')
                expect(fs.readdirSync(root)).toEqual([name + '.mjs'])
            } finally {
                await bundle.close()
            }
        }
    )

    it('rejects an emitted helper that depends on another application chunk', async () => {
        const config = (await configs()).find(
            (c: { input: Record<string, string> }) => c.input['full-upgrader']
        )
        const guard = config.plugins.find(
            (p: { name: string }) =>
                p.name === 'detached-helper-must-be-standalone'
        )
        const context = {
            error: (message: string) => {
                throw new Error(message)
            },
            getModuleIds: () => ['src/update/full-upgrader.ts']
        }
        expect(() =>
            guard.generateBundle.call(
                context,
                {},
                {
                    'full-upgrader.js': {
                        type: 'chunk',
                        imports: ['./filename-split.js'],
                        dynamicImports: [],
                        referencedFiles: []
                    }
                }
            )
        ).toThrow(/self-contained/)
    })
})
