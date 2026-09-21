import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('v0.4 Web/Desktop parity', () => {
  const web = fs.readFileSync('web/v040-parity.js', 'utf8')
  const account = fs.readFileSync('web/eh-account.js', 'utf8')
  const provider = fs.readFileSync('src/providers/eh-provider.ts', 'utf8')
  const providerTypes = fs.readFileSync('src/providers/types.ts', 'utf8')
  const service = fs.readFileSync('src/library/service.ts', 'utf8')
  const libraryTypes = fs.readFileSync('src/library/types.ts', 'utf8')
  const libraryQuery = fs.readFileSync('src/services/library-query-service.ts', 'utf8')
  const server = fs.readFileSync('src/library/server.ts', 'utf8')

  it('loads the parity layer from the normal desktop route', () => {
    expect(account).toContain("import('./v040-parity.js')")
    expect(fs.existsSync('web/v040-parity.css')).toBe(true)
  })

  it('keeps library storage scope and provider scope orthogonal', () => {
    expect(libraryTypes).toContain("providerIds?: Array<'pica' | 'eh'>")
    expect(libraryQuery).toContain('const selectedProviders = new Set(query.providerIds ?? [])')
    expect(libraryQuery).toContain("selectedProviders.has(comic.providerId ?? 'pica')")
    expect(web).toContain("provider.id = 'v040-library-provider'")
    expect(web).toContain('<option value="pica">')
    expect(web).toContain('<option value="eh">')
    expect(web).toContain("t('来源：Pica','Source: Pica','配信元：Pica')")
    expect(web).toContain("t('来源：E-H','Source: E-H','配信元：E-H')")
  })

  it('wires native E-H browse modes and advanced filtering end to end', () => {
    expect(providerTypes).toContain("'latest' | 'popular' | 'favorites' | 'watched' | 'toplist'")
    for (const field of ['ehMode','ehToplist','ehLanguage','ehExcludeTags','ehMinRating','ehPageFrom','ehPageTo']) {
      expect(providerTypes).toContain(field)
      expect(service).toContain(field)
      expect(server).toContain(field)
      expect(web).toContain(field)
    }
    expect(provider).toContain("url.pathname = '/popular'")
    expect(provider).toContain("url.pathname = '/watched'")
    expect(provider).toContain("url.pathname = '/toplist.php'")
    expect(provider).toContain('this.favoritesAll()')
    expect(provider).toContain('`${namespace}:"${tag}$"`')
  })

  it('uses EhTagTranslation only as a Chinese presentation/search alias layer', () => {
    expect(web).toContain('EhTagTranslation/DatabaseReleases')
    expect(web).toContain('db.text.json')
    expect(web).toContain('parityState.translations')
    expect(web).toContain('tag.dataset.rawValue = raw')
    expect(web).toContain("currentLanguage() !== 'zh-CN'")
    expect(web).toContain('canonical')
  })

  it('implements two-step author navigation over the unified catalog', () => {
    expect(web).toContain("showAuthorDirectory(name)")
    expect(web).toContain("showAuthorWorks(dialog")
    expect(web).toContain("scope:'catalog'")
    expect(web).toContain('authorIds:[authorId]')
    expect(web).toContain('/api/v1/authors/${encodeURIComponent(authorId)}/refresh')
    expect(web).toContain('正在联网补全 Pica / E-H 作者作品')
  })

  it('restores history outside primary navigation with time filters and exact-page resume', () => {
    expect(web).toContain("const HISTORY_KEY = 'pica-v040-reading-history-v1'")
    for (const label of ['今天','7天','30天','全部']) expect(web).toContain(label)
    expect(web).toContain('type="date"')
    expect(web).toContain('row.lastPage')
    expect(web).toContain('/api/v1/online-reader')
    expect(web).toContain("recordHistory({comicId:row.comicId")
  })

  it('keeps ExH an optional E-H capability rather than a core dependency', () => {
    expect(web).toContain("['eh','exh'].includes")
    expect(account).toContain("if (value === 'UNAVAILABLE') return ehT('当前不可访问','Unavailable','現在アクセス不可')")
    expect(account).toContain("if (value === 'NETWORK_ERROR') return ehT('暂无法确认','Unable to confirm','確認できません')")
    expect(account).not.toContain('ExH 权限')
  })
})
