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

    it('publishes complete Windows and Android upgrade assets', () => {
        const workflow = read('.github/workflows/v0411-release.yml')
        expect(workflow).toContain('name: v0.4.11 Formal Release')
        expect(workflow).toContain(
            'Pica-Library-v0.4.11-windows-x64.zip'
        )
        expect(workflow).toContain(
            'Pica-Library-v0.4.11-update-from-v0.4.10.zip'
        )
        expect(workflow).toContain(
            'Pica-Library-v0.4.11-upgrade-assistant.zip'
        )
        expect(workflow).toContain(
            "versionCode='54' versionName='0.4.11'"
        )
        expect(workflow).toContain('Pica-Library-Android-v54.apk')
        expect(workflow).toContain(
            'releases/download/v0.4.10/Pica-Library-Android-Preview.cert-sha256'
        )
        expect(workflow).toContain('gh release create v0.4.11')
        expect(workflow).toContain(
            "Android Preview v54 · Pica Library 0.4.11"
        )
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
