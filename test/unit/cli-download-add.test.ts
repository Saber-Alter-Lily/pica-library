import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { afterEach, describe, expect, it } from 'vitest'

const directories: string[] = []
const root = process.cwd()
const tsx = path.join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs')
const cli = path.join(root, 'src', 'library-cli.ts')

function runCli(args: string[]) {
    const env = { ...process.env }
    delete env.PICA_ACCOUNT
    delete env.PICA_PASSWORD
    return spawnSync(process.execPath, [tsx, cli, ...args], {
        cwd: root,
        env,
        encoding: 'utf8'
    })
}

afterEach(() => {
    for (const directory of directories.splice(0))
        fs.rmSync(directory, { recursive: true, force: true })
})

describe('download CLI', () => {
    it('adds raw IDs without credentials or starting the downloader', () => {
        const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-cli-add-'))
        directories.push(dataDir)
        const result = runCli([
            'download',
            'add',
            'raw-one',
            'raw-two',
            '--episodes',
            '1,3-4',
            '--runner',
            'GITHUB',
            '--data-dir',
            dataDir,
            '--json'
        ])

        expect(result.status).toBe(0)
        expect(result.stderr).not.toContain('PICA_ACCOUNT')
        expect(result.stderr).not.toContain('PICA_PASSWORD')
        expect(JSON.parse(result.stdout)).toEqual([
            expect.objectContaining({
                comicId: 'raw-one',
                episodeOrders: [1, 3, 4],
                runner: 'GITHUB',
                status: 'QUEUED'
            }),
            expect.objectContaining({
                comicId: 'raw-two',
                episodeOrders: [1, 3, 4],
                runner: 'GITHUB',
                status: 'QUEUED'
            })
        ])
    })

    it('documents presets and explicit custom performance arguments', () => {
        const result = runCli(['--help'])

        expect(result.status).toBe(0)
        expect(result.stdout).toContain('download add <comic-id...>')
        expect(result.stdout).toContain('conservative|balanced|fast')
        expect(result.stdout).toContain('--profile custom')
        expect(result.stdout).not.toContain('[--concurrency 5]')
    })
})
