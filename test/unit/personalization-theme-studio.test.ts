import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import AdmZip from 'adm-zip'
import { afterEach, describe, expect, it } from 'vitest'
import { PersonalizationService } from '../../src/services/personalization-service'

const directories: string[] = []

function temporaryRoot() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-theme-studio-'))
    directories.push(root)
    const web = path.join(root, 'web')
    fs.mkdirSync(web, { recursive: true })
    fs.writeFileSync(
        path.join(web, 'theme-pack-creator-prompt.txt'),
        'FIXED CREATOR PROMPT\nmascot-head.webp\n'
    )
    fs.writeFileSync(
        path.join(web, 'theme-pack-spec-v1.txt'),
        'THEME PACK SPEC V1\ncomponents.json\n'
    )
    return { root, web }
}

function serviceWithAccess() {
    const { root, web } = temporaryRoot()
    const service = new PersonalizationService(
        path.join(root, 'personalization'),
        web
    )
    fs.writeFileSync(service.starProofFile, JSON.stringify({ githubUser: 'theme-qa', verifiedAt: new Date().toISOString() }), 'utf8')
    return service
}

function webpStub() {
    return Buffer.concat([
        Buffer.from('RIFF', 'ascii'),
        Buffer.from([4, 0, 0, 0]),
        Buffer.from('WEBP', 'ascii')
    ])
}

function pngStub() {
    return Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
}

function themeArchive(options: { badProgress?: boolean } = {}) {
    const zip = new AdmZip()
    zip.addFile(
        'manifest.json',
        Buffer.from(
            JSON.stringify({
                themeFormatVersion: 1,
                id: 'violet-cat-test',
                name: 'Violet Cat Test',
                author: 'Theme QA',
                version: '1.0.0',
                description: 'Theme Studio integration fixture.'
            })
        )
    )
    zip.addFile(
        'palette.json',
        Buffer.from(
            JSON.stringify({
                light: {
                    primary: '#7457B9',
                    primarySoft: '#E9DFFF',
                    background: '#F7F3FB',
                    surface: '#FFFFFF',
                    nav: '#F0EAF6',
                    text: '#201E24',
                    muted: '#68636E',
                    outline: '#D8D2DC',
                    action: '#E7E4EA',
                    progressTrack: '#E9DFFF',
                    progressFill: '#7457B9'
                },
                dark: {
                    primary: '#D6BCFF',
                    primarySoft: '#503681',
                    background: '#15121B',
                    surface: '#241E2C',
                    nav: '#1D1824',
                    text: '#F4EFF7',
                    muted: '#C7C1CC',
                    outline: '#49454F',
                    action: '#2B2730',
                    progressTrack: '#3B3150',
                    progressFill: '#D6BCFF'
                }
            })
        )
    )
    zip.addFile(
        'layout.json',
        Buffer.from(
            JSON.stringify({
                cardRadiusDp: 20,
                coverRadiusDp: 14,
                density: 'standard'
            })
        )
    )
    zip.addFile(
        'components.json',
        Buffer.from(
            JSON.stringify({
                typography: { title: 'comic', navigation: 'rounded' },
                navigation: { selectedEffect: 'pill', iconScale: 'standard' },
                progress: {
                    style: options.badProgress ? 'javascript' : 'mascot',
                    headAsset: 'assets/mascot-head.webp',
                    motion: 'bobble',
                    effect: 'sparkle'
                },
                background: {
                    patternAsset: 'assets/pattern.webp',
                    patternOpacityLight: 0.1,
                    patternOpacityDark: 0.08
                },
                reader: { chrome: 'themed' }
            })
        )
    )
    for (const name of [
        'mascot-main.webp',
        'mascot-head.webp',
        'recommendation-loading.webp',
        'empty-state.webp',
        'nav-library.webp',
        'nav-recommend.webp',
        'nav-online.webp',
        'nav-connect.webp',
        'pattern.webp'
    ])
        zip.addFile(`assets/${name}`, webpStub())
    return zip.toBuffer()
}

afterEach(() => {
    for (const directory of directories.splice(0))
        fs.rmSync(directory, { recursive: true, force: true })
})

describe('Theme Studio', () => {
    it('exports a self-contained AI creator kit from one description and reference image', () => {
        const service = serviceWithAccess()
        const kit = service.createThemeCreatorKit({
            description: '紫发漫画向导、白猫、星空与薰衣草紫。',
            references: [
                {
                    name: '../my mascot!!.png',
                    mimeType: 'image/png',
                    dataBase64: pngStub().toString('base64')
                }
            ]
        })
        expect(kit.fileName).toBe('Pica-Library-Theme-Creator-Kit.zip')
        expect(kit.references).toBe(1)
        const zip = new AdmZip(kit.buffer)
        expect(zip.getEntry('00_READ_ME_FIRST.md')).not.toBeNull()
        expect(
            zip.getEntry('01_THEME_REQUEST.txt')?.getData().toString('utf8')
        ).toContain('紫发漫画向导')
        expect(
            zip.getEntry('02_FIXED_AI_PROMPT.md')?.getData().toString('utf8')
        ).toContain('FIXED CREATOR PROMPT')
        expect(
            zip.getEntry('03_THEME_PACK_SPEC_V1.md')?.getData().toString('utf8')
        ).toContain('THEME PACK SPEC V1')
        expect(zip.getEntry('template/components.json')).not.toBeNull()
        const refs = zip
            .getEntries()
            .map((entry) => entry.entryName)
            .filter((name) => name.startsWith('reference-images/'))
        expect(refs).toHaveLength(1)
        expect(refs[0]).not.toContain('../')
        expect(refs[0]).not.toContain('\\')
    })

    it('imports, activates and describes the same data-only pack', () => {
        const service = serviceWithAccess()
        const installed = service.importThemePack(
            'violet-cat-test.pica-theme',
            themeArchive()
        )
        expect(installed.id).toBe('violet-cat-test')
        expect(service.activateThemePack(installed.id).activeThemeId).toBe(
            'violet-cat-test'
        )
        expect(service.status().activeThemeId).toBe('violet-cat-test')
        const descriptor = service.themeDescriptor()
        expect(descriptor?.components).toMatchObject({
            progress: { style: 'mascot', motion: 'bobble', effect: 'sparkle' }
        })
        expect(descriptor?.assets['mascot-head.webp']).toMatch(
            /^data:image\/webp;base64,/
        )
        expect(descriptor?.assets['nav-library.webp']).toMatch(
            /^data:image\/webp;base64,/
        )
        expect(service.deactivateThemePack().activeThemeId).toBeNull()
    })

    it('rejects executable paths and unsupported component presets', () => {
        const service = serviceWithAccess()
        expect(() =>
            service.importThemePack(
                'bad.pica-theme',
                themeArchive({ badProgress: true })
            )
        ).toThrow(/progress\.style is invalid/)

        const zip = new AdmZip()
        zip.addFile(
            'manifest.json',
            Buffer.from(
                JSON.stringify({
                    themeFormatVersion: 1,
                    id: 'bad-path',
                    name: 'Bad Path',
                    author: 'QA',
                    version: '1',
                    description: ''
                })
            )
        )
        zip.addFile('assets/../../run.js', Buffer.from('alert(1)'))
        expect(() =>
            service.importThemePack('bad-path.zip', zip.toBuffer())
        ).toThrow()
    })

    it('rejects oversized or non-image creator references before export', () => {
        const service = serviceWithAccess()
        expect(() =>
            service.createThemeCreatorKit({
                description: 'simple theme',
                references: [
                    {
                        name: 'fake.png',
                        dataBase64:
                            Buffer.from('not-an-image').toString('base64')
                    }
                ]
            })
        ).toThrow(/PNG, JPEG, or WebP/)
    })
})
