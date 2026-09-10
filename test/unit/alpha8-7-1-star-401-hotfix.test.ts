import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PersonalizationService } from '../../src/services/personalization-service'

const originalFetch = globalThis.fetch
const roots: string[] = []

afterEach(() => {
    vi.restoreAllMocks()
    globalThis.fetch = originalFetch
    for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true })
})

describe('Alpha8.7.1 Star HTTP 401 hotfix', () => {
    it('falls back from repository stargazers to the named user public Star list', async () => {
        const calls: string[] = []
        globalThis.fetch = vi.fn(async (input: string | URL | Request) => {
            const url = input instanceof Request ? input.url : String(input)
            calls.push(url)
            if (url.includes('/repos/Saber-Alter-Lily/pica-library/stargazers'))
                return new Response('{"message":"Bad credentials"}', { status: 401 })
            if (url.includes('/users/Saber-Alter-Lily/starred'))
                return new Response(
                    JSON.stringify([{ full_name: 'Saber-Alter-Lily/pica-library' }]),
                    { status: 200, headers: { 'content-type': 'application/json' } }
                )
            throw new Error(`unexpected URL: ${url}`)
        }) as typeof fetch

        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-star-401-'))
        roots.push(root)
        const service = new PersonalizationService(root)
        await expect(service.verifyGitHubStar('Saber-Alter-Lily')).resolves.toMatchObject({
            starUnlocked: true,
            starUser: 'Saber-Alter-Lily'
        })
        expect(calls).toEqual([
            'https://api.github.com/repos/Saber-Alter-Lily/pica-library/stargazers?per_page=100&page=1',
            'https://api.github.com/users/Saber-Alter-Lily/starred?per_page=100&page=1'
        ])
    })

    it('keeps public GitHub reads eligible for proxy-auth direct retry without leaking authenticated requests', () => {
        const source = fs.readFileSync('src/update/application-fetch.ts', 'utf8')
        expect(source).toContain('publicGitHubRead')
        expect(source).toContain('[401, 403, 407, 429].includes(result.status)')
        expect(source).toContain("!headers.has('authorization')")
        expect(source).toContain("!headers.has('cookie')")
        expect(source).toContain('return await nativeFetch(input, init)')
    })

    it('keeps Android on the same dual public verification model', () => {
        const source = fs.readFileSync(
            'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/StarAccessStore.java',
            'utf8'
        )
        expect(source).toContain('checkRepositoryStargazers')
        expect(source).toContain('checkUserStars')
        expect(source).toContain('/users/"+encoded+"/starred?per_page=100&page=')
    })
})
