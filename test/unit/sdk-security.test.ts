import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { AxiosAdapter, AxiosResponse } from 'axios'
import { afterEach, describe, expect, it } from 'vitest'
import { Pica } from '../../src/sdk'
import { redactSensitive } from '../../src/utils'

function response(
    config: Parameters<AxiosAdapter>[0],
    data: unknown,
    responseHeaders: Record<string, string> = {}
): AxiosResponse {
    return {
        config,
        data,
        headers: responseHeaders,
        status: 200,
        statusText: 'OK'
    }
}

afterEach(() => {
    delete process.env.PICA_ALLOW_INSECURE_HTTP
})

describe('provider client security', () => {
    it('adds authorization to API requests but never media requests', async () => {
        let apiHeaders: unknown
        let mediaHeaders: unknown
        const apiAdapter: AxiosAdapter = async (config) => {
            if (config.url === 'auth/sign-in')
                return response(config, {
                    code: 200,
                    data: { token: 'private-token' }
                })
            apiHeaders = config.headers
            return response(config, { code: 200, data: { keywords: [] } })
        }
        const mediaAdapter: AxiosAdapter = async (config) => {
            mediaHeaders = config.headers
            return response(config, Buffer.from('image'))
        }
        const pica = new Pica({ apiAdapter, mediaAdapter })
        await pica.login('configured-account', 'configured-password')
        await pica.request('get', 'keywords')
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-sdk-'))
        await pica.downloadToFile(
            'https://media.example/image.jpg',
            path.join(directory, 'sdk-security.jpg')
        )
        fs.rmSync(directory, { recursive: true, force: true })
        expect(JSON.stringify(apiHeaders)).toContain('private-token')
        const serialized = JSON.stringify(mediaHeaders).toLowerCase()
        expect(serialized).not.toContain('private-token')
        expect(serialized).not.toMatch(/authorization|signature|api-key|nonce/)
        expect(() =>
            pica.request('get', 'https://untrusted.example/collect')
        ).toThrow('trusted relative endpoint')
    })

    it('disables HTTP media by default and keeps explicit fallback credential-free', async () => {
        const requests: unknown[] = []
        const mediaAdapter: AxiosAdapter = async (config) => {
            requests.push(config.headers)
            return response(config, Buffer.from('image'))
        }
        const pica = new Pica({ mediaAdapter })
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-sdk-'))
        await expect(
            pica.downloadToFile(
                'http://media.example/image.jpg',
                path.join(directory, 'no.jpg')
            )
        ).rejects.toThrow('require HTTPS')
        process.env.PICA_ALLOW_INSECURE_HTTP = 'true'
        await pica.downloadToFile(
            'http://media.example/image.jpg',
            path.join(directory, 'yes.jpg')
        )
        fs.rmSync(directory, { recursive: true, force: true })
        expect(JSON.stringify(requests).toLowerCase()).not.toMatch(
            /authorization|token|cookie|signature|api-key/
        )
    })

    it('redacts nested success and error credential fields', () => {
        expect(
            redactSensitive({
                token: 'a',
                nested: { password: 'b', safe: 'ok' }
            })
        ).toEqual({
            token: '[REDACTED]',
            nested: { password: '[REDACTED]', safe: 'ok' }
        })
    })

    it('accepts bounded image responses and rejects non-image cover data', async () => {
        const mediaAdapter: AxiosAdapter = async (config) =>
            response(config, Buffer.from('image'), {
                'content-type': 'image/jpeg; charset=binary'
            })
        const pica = new Pica({ mediaAdapter })
        await expect(
            pica.fetchImage('https://media.example/cover.jpg', 32)
        ).resolves.toMatchObject({ contentType: 'image/jpeg' })

        const textClient = new Pica({
            mediaAdapter: async (config) =>
                response(config, Buffer.from('no'), {
                    'content-type': 'text/html'
                })
        })
        await expect(
            textClient.fetchImage('https://media.example/error', 32)
        ).rejects.toThrow('not an image')
        await expect(
            pica.fetchImage('https://media.example/large.jpg', 2)
        ).rejects.toThrow('size limit')
    })
})
