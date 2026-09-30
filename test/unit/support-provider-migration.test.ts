import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(import.meta.dirname, '../..')
const activeSupportFiles = [
    '.github/FUNDING.yml',
    'README.md',
    'README.en.md',
    'docs/quick-start.zh-CN.md',
    'docs/quick-start.en.md',
    'docs/desktop-guide.zh-CN.md',
    'docs/desktop-guide.en.md',
    'docs/android-guide.zh-CN.md',
    'docs/android-guide.en.md',
    'web/alpha8-product.js',
    'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/HomeActivity.java',
    'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/SupportActivity.java',
    'mobile/android-alpha2/app/src/main/assets/locales/android-ui-literals.json',
    'mobile/android-alpha2/app/src/main/assets/locales/web-dynamic-literals.json'
]

describe('project support provider migration', () => {
    it('keeps active support surfaces on AZZ / 爱赞助 only', () => {
        const combined = activeSupportFiles
            .map((file) => fs.readFileSync(path.join(root, file), 'utf8'))
            .join('\n')

        expect(combined).toContain('https://azz.net/PicaLibrary')
        expect(combined).toContain('爱赞助')
        expect(combined).not.toMatch(/afdian/i)
        expect(combined).not.toContain('爱发电')
        expect(combined).not.toContain('愛発電')
    })
})
