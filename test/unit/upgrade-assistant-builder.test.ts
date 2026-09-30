import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import AdmZip from 'adm-zip'
import { afterEach, describe, expect, it } from 'vitest'
import { buildUpgradeAssistant } from '../../scripts/build-upgrade-assistant'

const roots: string[] = []

function tempRoot() {
    const root = fs.mkdtempSync(
        path.join(os.tmpdir(), 'pica-upgrade-assistant-builder-')
    )
    roots.push(root)
    return root
}

afterEach(() => {
    for (const root of roots.splice(0))
        fs.rmSync(root, { recursive: true, force: true })
})

describe('generic Upgrade Assistant builder', () => {
    it('binds source/target identity, schema and official package hash', () => {
        const root = tempRoot()
        const sourceSha = 'a'.repeat(40)
        const target = path.join(
            root,
            'Pica-Library-v0.5.0-windows-x64.zip'
        )
        const full = new AdmZip()
        full.addFile('SOURCE_SHA.txt', Buffer.from(sourceSha + '\n'))
        full.addFile('Pica Library.exe', Buffer.from('launcher'))
        full.addFile('runtime/node.exe', Buffer.from('runtime'))
        full.addFile('app/desktop.js', Buffer.from('desktop'))
        full.addFile('app/updater.js', Buffer.from('updater'))
        full.addFile('app/full-upgrader.js', Buffer.from('full-upgrader'))
        full.writeZip(target)

        const output = path.join(
            root,
            'Pica-Library-v0.5.0-upgrade-assistant-from-v0.4.11.zip'
        )
        const built = buildUpgradeAssistant({
            sourceVersion: '0.4.11',
            targetVersion: '0.5.0',
            targetZipFile: target,
            targetSourceSha: sourceSha,
            targetDatabaseSchema: 14,
            outputFile: output
        })

        expect(built).toMatchObject({
            sourceVersion: '0.4.11',
            targetVersion: '0.5.0',
            targetSourceSha: sourceSha,
            targetDatabaseSchema: 14
        })
        expect(fs.existsSync(output)).toBe(true)

        const archive = new AdmZip(output)
        const script = archive
            .readAsText('Upgrade-Pica-Library-v0.5.0.ps1')
        const launcher = archive
            .readAsText('Upgrade-Pica-Library-v0.5.0.cmd')
        const readme = archive.readAsText('README.txt')

        expect(script).toContain("$TargetVersion = '0.5.0'")
        expect(script).toContain("$RequiredSourceVersion = '0.4.11'")
        expect(script).toContain('$ExpectedDatabaseSchema = 14')
        expect(script).toContain(
            `$ExpectedTargetSourceSha = '${sourceSha}'`
        )
        expect(script).toContain(
            '/releases/download/v0.5.0/Pica-Library-v0.5.0-windows-x64.zip'
        )
        expect(script).not.toContain(
            "$RequiredSourceVersion = '0.4.0'"
        )
        expect(launcher).toContain('v0.4.11 -^> v0.5.0')
        expect(launcher).toContain(
            'Upgrade-Pica-Library-v0.5.0.ps1'
        )
        expect(readme).toContain(
            'Normal v0.4.11 users should use the in-app one-click update first.'
        )
        expect(readme).not.toContain('Template lineage:')
        expect(readme).not.toContain(
            '此助手只接受已验证的 v0.4.0'
        )
    })

    it('rejects a target package whose SOURCE_SHA does not match', () => {
        const root = tempRoot()
        const target = path.join(
            root,
            'Pica-Library-v0.5.0-windows-x64.zip'
        )
        const full = new AdmZip()
        full.addFile('SOURCE_SHA.txt', Buffer.from('b'.repeat(40) + '\n'))
        full.writeZip(target)

        expect(() =>
            buildUpgradeAssistant({
                sourceVersion: '0.4.11',
                targetVersion: '0.5.0',
                targetZipFile: target,
                targetSourceSha: 'a'.repeat(40),
                targetDatabaseSchema: 14,
                outputFile: path.join(root, 'assistant.zip')
            })
        ).toThrow(/SOURCE_SHA does not match/i)
    })
})
