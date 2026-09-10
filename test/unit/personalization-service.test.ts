import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { PersonalizationService } from '../../src/services/personalization-service'

const roots: string[] = []
afterEach(() => {
    while (roots.length)
        fs.rmSync(roots.pop()!, { recursive: true, force: true })
})

describe('PersonalizationService', () => {
    it('keeps supporter-only theme packs hidden without a signed entitlement', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-personalization-'))
        roots.push(root)
        const service = new PersonalizationService(root)
        expect(service.status()).toMatchObject({ supporter: false, features: [] })
        expect(service.listThemePacks()).toEqual([])
    })

    it('rejects forged supporter entitlements', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-personalization-'))
        roots.push(root)
        const service = new PersonalizationService(root)
        expect(() =>
            service.verifyGrant({
                schema: 1,
                supporterId: 'forged',
                issuedAt: new Date().toISOString(),
                expiresAt: '',
                features: ['theme-packs'],
                nonce: 'not-a-real-grant',
                signature: Buffer.from('forged').toString('base64')
            })
        ).toThrow()
    })
})
