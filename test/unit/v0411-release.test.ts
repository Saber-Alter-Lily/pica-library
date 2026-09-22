import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { releasedUpdateBaseline } from '../../src/update/released-baselines'

const root = path.resolve(import.meta.dirname, '../..')
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

describe('v0.4.11 formal release contract', () => {
    it('pins one coordinated Desktop and Android release', () => {
        const pkg = JSON.parse(read('package.json'))
        const gradle = read('mobile/android-alpha2/app/build.gradle')
        const windows = read('scripts/build-windows-package.ps1')

        expect(pkg.version).toBe('0.4.11')
        expect(gradle).toContain("PICA_ANDROID_VERSION_CODE') ?: '54'")
        expect(gradle).toContain("PICA_ANDROID_VERSION_NAME') ?: '0.4.11'")
        expect(windows).toContain("$version -eq '0.4.11'")
        expect(windows).toContain('Pica-Library-v0.4.10-windows-x64.zip')
        expect(windows).toContain(
            '6d53832632545634ced23d24c67aa16e0e8c25ffa10e185f0a14a92962575aab'
        )
        expect(releasedUpdateBaseline('0.4.10')).toMatchObject({
            appApiVersion: 2,
            advertisedDatabaseSchemaVersion: 13,
            actualMigrationVersion: 13
        })
    })

    it('retires the one-shot v0.4.11 publisher after publication', () => {
        expect(
            fs.existsSync(
                path.join(root, '.github/workflows/v0411-release.yml')
            )
        ).toBe(false)

        const log = read('PROJECT_LOG.md')
        const readme = read('README.md')
        expect(log).toContain('Desktop v0.4.11 / Android versionCode 54')
        expect(log).toContain('v0.4.1–v0.4.10')
        expect(readme).toContain('Pica-Library-v0.4.11-windows-x64.zip')
        expect(readme).toContain(
            'Pica-Library-v0.4.11-upgrade-assistant.zip'
        )
        expect(readme).toContain('v54 / 0.4.11')
    })

    it('keeps the public homepage focused on user-visible capabilities', () => {
        const zh = read('README.md')
        const en = read('README.en.md')

        expect(zh).toContain('## 主要功能')
        expect(zh).toContain('## v0.4.11 本次更新')
        expect(en).toContain('## Main features')
        expect(en).toContain('## v0.4.11 highlights')

        for (const internal of [
            'PROBABLE_SAME_WORK',
            'KEEP_SEPARATE',
            'canonical authorId',
            'embeddingKind',
            'resolverVersion'
        ]) {
            expect(zh).not.toContain(internal)
            expect(en).not.toContain(internal)
        }
    })

    it('keeps v0.4.0 as the direct public upgrade baseline', () => {
        for (const file of [
            'README.md',
            'README.en.md',
            'docs/quick-start.zh-CN.md',
            'docs/quick-start.en.md',
            'docs/windows-distribution.zh-CN.md',
            'docs/windows-distribution.md'
        ]) {
            const text = read(file)
            expect(text).toContain('v0.4.0')
            expect(text).toContain('v0.4.11')
        }
    })
})
