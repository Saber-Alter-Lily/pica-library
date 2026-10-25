import fs from 'node:fs'
import AdmZip from 'adm-zip'
import { afterEach, describe, it, expect, vi } from 'vitest'
import { build } from 'esbuild'
import {
    inspectThemePack,
    themePackInfo,
    THEME_PACK_LIMITS
} from '../../src/themes/pack'
import { themeArchive, digest } from '../helpers/profile-resource-fixture'
afterEach(() => {
    vi.restoreAllMocks()
})
describe('extracted data-only theme validation, no service construction or authorization persistence', () => {
    it('retains actual v1 identity/metadata/checksum and does not open files or create the built-in theme', () => {
        const bytes = themeArchive(),
            open = vi.spyOn(fs, 'openSync').mockImplementation(() => {
                throw Error('unexpected synthetic file open')
            })
        const inspected = inspectThemePack('own-theme.pica-theme', bytes)
        expect(themePackInfo(inspected, bytes)).toEqual({
            id: 'own-theme',
            name: 'Synthetic own theme',
            author: 'Synthetic QA',
            version: '1.0.0',
            description: 'Data-only synthetic fixture',
            size: bytes.length,
            sha256: digest(bytes)
        })
        expect(open).not.toHaveBeenCalled()
    })
    it.each([
        { badPalette: true },
        { badComponent: true },
        { executable: true }
    ])('preserves rejection of invalid declarative themes %j', (extra) => {
        expect(() =>
            inspectThemePack('own-theme.zip', themeArchive('own-theme', extra))
        ).toThrow()
    })
    it.each(['manifest', 'format', 'identity'])(
        'retains the original %s validation boundary',
        (mode) => {
            const zip = new AdmZip()
            zip.addFile(
                mode === 'manifest' ? 'palette.json' : 'manifest.json',
                Buffer.from(
                    JSON.stringify({
                        themeFormatVersion: mode === 'format' ? 2 : 1,
                        id: mode === 'identity' ? '../escape' : 'own-theme'
                    })
                )
            )
            expect(() =>
                inspectThemePack('own-theme.zip', zip.toBuffer())
            ).toThrow()
        }
    )
    it('retains size/name guards before attempting ZIP parsing', () => {
        expect(() =>
            inspectThemePack('own-theme.exe', Buffer.from('invalid zip'))
        ).toThrow('.pica-theme or .zip')
        expect(() =>
            inspectThemePack(
                'own-theme.zip',
                Buffer.alloc(THEME_PACK_LIMITS.archiveBytes + 1)
            )
        ).toThrow('size is invalid')
        expect(() =>
            inspectThemePack('own-theme.zip', Buffer.alloc(0))
        ).toThrow('size is invalid')
        expect(Object.isFrozen(THEME_PACK_LIMITS)).toBe(true)
    })
    it('has a single application-source dependency with no filesystem service, proof or network graph', async () => {
        const built = await build({
            entryPoints: ['src/themes/pack.ts'],
            bundle: true,
            platform: 'node',
            format: 'esm',
            write: false,
            metafile: true,
            logLevel: 'silent'
        })
        expect(
            Object.keys(built.metafile!.inputs)
                .filter((name) => name.startsWith('src/'))
                .sort()
        ).toEqual(['src/themes/pack.ts'])
    })
})
