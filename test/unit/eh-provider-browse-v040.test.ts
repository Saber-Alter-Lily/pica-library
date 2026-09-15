import { afterEach, describe, expect, it, vi } from 'vitest'
import { EhProvider } from '../../src/providers/eh-provider'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
  vi.restoreAllMocks()
})

function metadata(overrides: Record<string, unknown> = {}) {
  return {
    gid: 123,
    token: 'abcdef1234',
    title: 'Example',
    category: 'Doujinshi',
    thumb: 'https://ehgt.org/a/b.jpg',
    uploader: 'tester',
    posted: '1700000000',
    filecount: '20',
    rating: '4.5',
    tags: ['artist:alice','language:english','female:glasses'],
    ...overrides
  }
}

function searchMock() {
  return vi
    .fn()
    .mockResolvedValueOnce(new Response('<a href="/g/123/abcdef1234/">one</a>', { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ gmetadata: [metadata()] }), { status: 200, headers: { 'content-type': 'application/json' } }))
}

describe('E-H v0.4 browse modes', () => {
  it('uses the native Popular route and applies metadata filters', async () => {
    const mock = searchMock()
    globalThis.fetch = mock as typeof fetch
    const result = await new EhProvider().search({ ehMode: 'popular', ehLanguage: 'english', ehMinRating: 4, ehPageFrom: 10, ehPageTo: 30 })
    expect(result).toHaveLength(1)
    expect(new URL(String(mock.mock.calls[0][0])).pathname).toBe('/popular')
  })

  it('uses the native Toplist route and requested toplist code', async () => {
    const mock = searchMock()
    globalThis.fetch = mock as typeof fetch
    await new EhProvider().search({ ehMode: 'toplist', ehToplist: '15' })
    const url = new URL(String(mock.mock.calls[0][0]))
    expect(url.pathname).toBe('/toplist.php')
    expect(url.searchParams.get('tl')).toBe('15')
  })

  it('uses authenticated Watched and keeps account cookies scoped to E-H', async () => {
    const mock = searchMock()
    globalThis.fetch = mock as typeof fetch
    await new EhProvider({ memberId: '1', passHash: 'hash' }).search({ ehMode: 'watched' })
    const url = new URL(String(mock.mock.calls[0][0]))
    expect(url.pathname).toBe('/watched')
    const headers = new Headers(mock.mock.calls[0][1]?.headers)
    expect(headers.get('cookie')).toContain('ipb_member_id=1')
  })

  it('emits exact namespaced E-H tag syntax and negative tag terms', async () => {
    const mock = searchMock()
    globalThis.fetch = mock as typeof fetch
    await new EhProvider().search({ tags: ['character:tatsumaki'], ehExcludeTags: ['female:glasses'] })
    const url = new URL(String(mock.mock.calls[0][0]))
    const query = url.searchParams.get('f_search') || ''
    expect(query).toContain('character:"tatsumaki$"')
    expect(query).toContain('-female:"glasses$"')
  })
})
