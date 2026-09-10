import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { LibraryDatabase } from '../../src/library/database'
import {
    EmptyBrowserLiteLibraryError,
    serializeBrowserLiteDataPackage
} from '../../src/library/bundle-export'
import { validateLibraryBundle } from '../../src/types/bundle'
import { translate, translations } from '../../web/i18n.js'

const temporaryDirectories: string[] = []

function database() {
    const directory = fs.mkdtempSync(
        path.join(os.tmpdir(), 'pica-lite-export-')
    )
    temporaryDirectories.push(directory)
    return new LibraryDatabase(path.join(directory, 'library.db'))
}

afterEach(() => {
    while (temporaryDirectories.length)
        fs.rmSync(temporaryDirectories.pop()!, { recursive: true, force: true })
})

describe('Browser Lite data package onboarding', () => {
    it('browser_lite_onboarding_zh_cn', () => {
        expect(translate('zh-CN', 'browserLite.title')).toBe(
            '开始使用 Browser Lite'
        )
        expect(translate('zh-CN', 'browserLite.intro')).toContain(
            '无需在网页中填写 Pica 账号或密码'
        )
    })

    it('browser_lite_onboarding_en', () => {
        expect(translate('en', 'browserLite.title')).toBe(
            'Get started with Browser Lite'
        )
        expect(translate('en', 'browserLite.step4')).toContain(
            'pica-library-bundle.json'
        )
    })

    it('browser_lite_export_entry_visible', () => {
        const html = fs.readFileSync('web/index.html', 'utf8')
        expect(html).toContain('id="settings-browser-lite"')
        expect(html).toContain('id="export-browser-lite"')
        expect(html).toContain('id="open-browser-lite-export"')
    })

    it('browser_lite_export_uses_existing_bundle_contract', () => {
        const store = database()
        store.importCatalog([
            {
                comicId: 'portable-comic',
                title: 'Portable Work',
                author: 'Example Author',
                categories: ['Story'],
                tags: ['sample'],
                finished: false
            }
        ])
        const serialized = serializeBrowserLiteDataPackage(store, {
            generatedAt: '2026-08-13T00:00:00.000Z'
        })
        const bundle = validateLibraryBundle(JSON.parse(serialized))
        expect(bundle).toMatchObject({
            schemaVersion: 1,
            kind: 'pica-library-bundle',
            library: { comics: [{ comicId: 'portable-comic' }] },
            provenance: {
                application: 'pica-library',
                source: 'desktop-export'
            }
        })
        store.close()
    })

    it('browser_lite_export_empty_library_guidance', () => {
        const store = database()
        expect(() => serializeBrowserLiteDataPackage(store)).toThrow(
            EmptyBrowserLiteLibraryError
        )
        expect(translate('en', 'message.browserLiteExportEmpty')).toContain(
            'Sync your favorites or import library data first'
        )
        store.close()
    })

    it('browser_lite_bundle_secret_exclusion', () => {
        const store = database()
        store.importCatalog([
            {
                comicId: 'safe-comic',
                title: 'Safe Work',
                author: 'Safe Author',
                categories: [],
                tags: [],
                finished: false
            }
        ])
        const serialized = serializeBrowserLiteDataPackage(store)
        for (const forbidden of [
            'PICA_ACCOUNT',
            'PICA_PASSWORD',
            'Authorization',
            'Bearer ',
            'Cookie',
            'proxyUsername',
            'proxyPassword',
            'C:\\Users\\'
        ])
            expect(serialized).not.toContain(forbidden)
        store.close()
    })

    it('browser_lite_export_language_switch', () => {
        expect(Object.keys(translations.en)).toEqual(
            Object.keys(translations['zh-CN'])
        )
        expect(translate('zh-CN', 'settings.browserLiteExport')).toBe(
            '导出 Browser Lite 数据包'
        )
        expect(translate('en', 'settings.browserLiteExport')).toBe(
            'Export Browser Lite Data Package'
        )
    })
})
