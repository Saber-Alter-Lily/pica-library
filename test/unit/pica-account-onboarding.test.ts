import { describe, expect, it } from 'vitest'
import { AxiosError, AxiosHeaders, type AxiosAdapter } from 'axios'
import { Pica } from '../../src/sdk'
import { validatePicaRegistration } from '../../src/services/pica-account'

const input = () => ({
    name: 'Demo Reader',
    email: 'example_reader',
    password: ' example-password ',
    confirmPassword: ' example-password ',
    birthday: '2000-09-13',
    gender: 'bot',
    question1: 'Question one',
    question2: 'Question two',
    question3: 'Question three',
    answer1: ' private answer ',
    answer2: 'two',
    answer3: 'three',
    acceptedTerms: true
})
describe('Pica registration and account errors', () => {
    it('accepts Pica usernames without requiring an email and preserves secrets exactly', () => {
        const value = validatePicaRegistration(input())
        expect(value.email).toBe('example_reader')
        expect(value.password).toBe(' example-password ')
        expect(value.answer1).toBe(' private answer ')
        expect(value).not.toHaveProperty('confirmPassword')
        expect(value).not.toHaveProperty('acceptedTerms')
    })
    it('uses conservative provider-compatible username and password rules for new accounts', () => {
        expect(() =>
            validatePicaRegistration({
                ...input(),
                email: 'reader_01.',
                password: '123456789',
                confirmPassword: '123456789'
            })
        ).not.toThrow()
        expect(() =>
            validatePicaRegistration({
                ...input(),
                password: '12345678',
                confirmPassword: '12345678'
            })
        ).toThrow()
        expect(() =>
            validatePicaRegistration({ ...input(), email: 'reader-name' })
        ).toThrow()
        expect(() =>
            validatePicaRegistration({ ...input(), email: '12345678901234567' })
        ).toThrow()
    })
    it('requires real age, valid date and explicit consent', () => {
        expect(() =>
            validatePicaRegistration({ ...input(), acceptedTerms: false })
        ).toThrow()
        expect(() =>
            validatePicaRegistration({ ...input(), birthday: '2020-01-01' })
        ).toThrow()
        expect(() =>
            validatePicaRegistration({ ...input(), birthday: '2000-02-30' })
        ).toThrow()
        expect(() =>
            validatePicaRegistration(
                { ...input(), birthday: '2008-09-14' },
                new Date('2026-09-13Z')
            )
        ).toThrow()
        expect(() =>
            validatePicaRegistration(
                { ...input(), birthday: '2008-09-13' },
                new Date('2026-09-13Z')
            )
        ).not.toThrow()
    })
    it('rejects missing recovery fields, invalid gender and mismatched passwords without echoing values', () => {
        for (const change of [
            { answer1: '' },
            { gender: 'unknown' },
            { confirmPassword: 'SECRET' }
        ]) {
            try {
                validatePicaRegistration({ ...input(), ...change })
                throw new Error('accepted')
            } catch (error) {
                expect(String(error)).not.toContain('SECRET')
                expect(String(error)).not.toContain('accepted')
            }
        }
    })
    it('submits one auth/register through signed SDK, without bearer or auto-login', async () => {
        const calls: string[] = []
        const apiAdapter: AxiosAdapter = async (config) => {
            calls.push(config.url!)
            expect(config.timeout).toBe(30000)
            expect(config.headers.has('signature')).toBe(true)
            expect(config.headers.has('authorization')).toBe(false)
            const payload = JSON.parse(config.data)
            expect(payload.email).toBe(input().email)
            expect(payload.confirmPassword).toBeUndefined()
            return {
                config,
                data: { code: 200 },
                status: 200,
                statusText: 'OK',
                headers: new AxiosHeaders()
            }
        }
        const client = new Pica({ apiAdapter, proxyUrl: false })
        client.token = 'existing-private-session'
        expect(await client.register(input())).toEqual({ registered: true })
        expect(calls).toEqual(['auth/register'])
        expect(client.token).toBe('existing-private-session')
    })
    it('turns known provider validation responses into actionable safe categories', async () => {
        const apiAdapter: AxiosAdapter = async (config) => {
            throw new AxiosError(
                'provider rejected request',
                'ERR_BAD_RESPONSE',
                config,
                {},
                {
                    config,
                    data: {
                        code: 400,
                        error: 1002,
                        message: 'validation error',
                        detail: 'birthday must be a valid date string'
                    },
                    status: 400,
                    statusText: 'failure',
                    headers: new AxiosHeaders()
                }
            )
        }
        await expect(new Pica({ apiAdapter }).register(input())).rejects.toMatchObject({
            category: 'INVALID_BIRTHDAY'
        })
    })
    it('recognizes a username collision without surfacing provider body text', async () => {
        const apiAdapter: AxiosAdapter = async (config) => {
            throw new AxiosError(
                'SECRET request',
                'ERR_BAD_RESPONSE',
                config,
                {},
                {
                    config,
                    data: { message: 'email already exists SECRET' },
                    status: 400,
                    statusText: 'failure',
                    headers: new AxiosHeaders()
                }
            )
        }
        const client = new Pica({ apiAdapter })
        await expect(client.register(input())).rejects.toMatchObject({
            category: 'USERNAME_TAKEN'
        })
        await expect(client.register(input())).rejects.not.toThrow('SECRET')
    })
    it.each([400, 401, 403, 429, 500])(
        'sanitizes HTTP %s without retrying registration',
        async (status) => {
            let calls = 0
            const apiAdapter: AxiosAdapter = async (config) => {
                calls++
                throw new AxiosError(
                    'SECRET request',
                    'ERR_BAD_RESPONSE',
                    config,
                    {},
                    {
                        config,
                        data: { message: 'SECRET password' },
                        status,
                        statusText: 'failure',
                        headers: new AxiosHeaders()
                    }
                )
            }
            const client = new Pica({ apiAdapter })
            client.retryMap.set('auth/register', 3)
            await expect(client.register(input())).rejects.not.toThrow('SECRET')
            expect(calls).toBe(1)
        }
    )
    it('classifies transport separately and never retries login', async () => {
        let calls = 0
        const apiAdapter: AxiosAdapter = async (config) => {
            calls++
            throw new AxiosError('SECRET', 'ETIMEDOUT', config)
        }
        const client = new Pica({ apiAdapter })
        await expect(
            client.login('sample', 'sample-password')
        ).rejects.toMatchObject({ category: 'NETWORK' })
        expect(calls).toBe(1)
    })
    it('rejects API-level failure and hides arbitrary provider text', async () => {
        const apiAdapter: AxiosAdapter = async (config) => ({
            config,
            data: { code: 400, message: 'SECRET' },
            status: 200,
            statusText: 'OK',
            headers: new AxiosHeaders()
        })
        await expect(
            new Pica({ apiAdapter }).register(input())
        ).rejects.toMatchObject({ category: 'REJECTED' })
    })
})
