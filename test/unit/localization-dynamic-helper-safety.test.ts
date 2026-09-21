import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(import.meta.dirname, '../..')
const files = [
    'web/account-onboarding.js',
    'web/alpha7-cloud.js',
    'web/alpha8-7-desktop-hub.js',
    'web/alpha8-connections.js',
    'web/alpha8-product.js',
    'web/alpha8-theme-help.js',
    'web/alpha8-update-ui.js',
    'web/app.js',
    'web/ecosystem-pack-v1.js',
    'web/eh-account.js',
    'web/locale-runtime.js',
    'web/onboarding-v1.js',
    'web/recommendation-v5-evaluation.js',
    'web/recommendation-v5.js',
    'web/ui-polish-v5.js',
    'web/work-identity-review.js'
]

describe('localized dynamic helper safety', () => {
    it('keeps the recommendation count helpers non-recursive', () => {
        const source = fs.readFileSync(path.join(root, 'web/recommendation-v5.js'), 'utf8')
        expect(source).toContain(
            'function v5Channels(count){ return v5t(`${count} 条通道`,`${count} channels`,`${count} チャンネル`) }'
        )
        expect(source).not.toContain('v5Channels(count)}`,`${count} channels`')
    })

    it('has no direct self-recursive return helper in localization-touched dynamic scripts', () => {
        const problems: string[] = []
        for (const relativePath of files) {
            const source = fs.readFileSync(path.join(root, relativePath), 'utf8')
            const functionPattern =
                /function\s+([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{\s*return\s+([^}\n]+)\}/g
            for (const match of source.matchAll(functionPattern)) {
                const [, name, expression] = match
                const selfCall = new RegExp(
                    '\\b' + name.replace(/[$]/g, '\\$&') + '\\s*\\('
                )
                if (selfCall.test(expression))
                    problems.push(`${relativePath}: ${name} -> ${expression.trim()}`)
            }
            const arrowPattern =
                /const\s+([A-Za-z_$][\w$]*)\s*=\s*\([^)]*\)\s*=>\s*([^;\n]+)/g
            for (const match of source.matchAll(arrowPattern)) {
                const [, name, expression] = match
                const selfCall = new RegExp(
                    '\\b' + name.replace(/[$]/g, '\\$&') + '\\s*\\('
                )
                if (selfCall.test(expression))
                    problems.push(`${relativePath}: ${name} -> ${expression.trim()}`)
            }
        }
        expect(problems).toEqual([])
    })
})
