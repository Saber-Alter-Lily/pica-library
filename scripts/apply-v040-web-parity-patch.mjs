import fs from 'node:fs'

function replaceOne(file, pattern, replacement, label) {
    const before = fs.readFileSync(file, 'utf8')
    const after = before.replace(pattern, replacement)
    if (after === before) throw new Error(`Patch target not found: ${label}`)
    fs.writeFileSync(file, after)
}

const enhancedEhSearch = [
"    async search(input: SearchRequest) {",
"        const surface: EhSurface = input.surface ?? 'eh'",
"        const mode = input.ehMode ?? 'latest'",
"        if (surface === 'exh') {",
"            if (!this.session) throw new Error('E-H account session is required for ExH')",
"            const capability = await this.probeExHentai()",
"            if (capability !== 'AVAILABLE')",
"                throw new Error(capability === 'NETWORK_ERROR' ? 'ExH availability check failed because of a network error' : 'This E-H account does not currently have ExH access')",
"        }",
"        const exactTerm = (raw: string) => {",
"            const value = raw.trim()",
"            const colon = value.indexOf(':')",
"            if (colon <= 0 || /[\\\"']/u.test(value)) return value",
"            const namespace = value.slice(0, colon).trim()",
"            const tag = value.slice(colon + 1).trim().replace(/\\\"/g, '')",
"            return namespace && tag ? `${namespace}:\"${tag}$\"` : value",
"        }",
"        const matchesFilters = (comic: ProviderComic) => {",
"            const categories = new Set((input.categories ?? []).map((item) => item.toLowerCase()))",
"            if (categories.size && !comic.categories.some((category) => categories.has(category.toLowerCase()))) return false",
"            if (Number(input.ehMinRating ?? 0) > 0 && Number(comic.rating ?? 0) < Number(input.ehMinRating)) return false",
"            if (Number(input.ehPageFrom ?? 0) > 0 && Number(comic.pagesCount ?? 0) < Number(input.ehPageFrom)) return false",
"            if (Number(input.ehPageTo ?? 0) > 0 && Number(comic.pagesCount ?? 0) > Number(input.ehPageTo)) return false",
"            const tags = new Set(comic.canonicalTags.map((tag) => tag.raw.toLowerCase()))",
"            const language = String(input.ehLanguage ?? '').trim().toLowerCase()",
"            if (language && !tags.has(`language:${language}`)) return false",
"            for (const raw of input.ehExcludeTags ?? []) if (tags.has(raw.trim().toLowerCase())) return false",
"            return true",
"        }",
"        if (mode === 'favorites') {",
"            const favorites = await this.favoritesAll()",
"            return favorites.filter(matchesFilters).slice(0, Math.max(1, Math.min(input.limit ?? 100, 100)))",
"        }",
"        await this.paceSearch()",
"        const origin = surface === 'exh' ? EXH_ORIGIN : GALLERY_ORIGIN",
"        const url = new URL('/', origin)",
"        const terms = [input.keyword?.trim() ?? '', ...(input.tags ?? []).map(exactTerm)]",
"            .map((value) => value.trim()).filter(Boolean)",
"        const language = String(input.ehLanguage ?? '').trim()",
"        if (language) terms.push(`language:\"${language}$\"`)",
"        for (const tag of input.ehExcludeTags ?? []) terms.push('-' + exactTerm(tag))",
"        if (mode === 'popular') url.pathname = '/popular'",
"        else if (mode === 'watched') {",
"            if (!this.session) throw new Error('E-H account session is required for Watched')",
"            url.pathname = '/watched'",
"        } else if (mode === 'toplist') {",
"            url.pathname = '/toplist.php'",
"            const toplist = ['11','12','13','15'].includes(String(input.ehToplist ?? '11')) ? String(input.ehToplist ?? '11') : '11'",
"            url.searchParams.set('tl', toplist)",
"        } else if (terms.length) url.searchParams.set('f_search', terms.join(' '))",
"        const authenticated = surface === 'exh' || mode === 'watched'",
"        const html = authenticated ? await this.authenticatedText(url.toString()) : await this.text(url.toString())",
"        const refs = galleryRefs(html).slice(0, Math.max(1, Math.min(input.limit ?? 25, 100)))",
"        if (!refs.length) return []",
"        return (await this.gdata(refs, surface))",
"            .filter((item) => !item.error)",
"            .map((item) => ehMetadataToComic(item, surface))",
"            .filter(matchesFilters)",
"    }",
"",
"    async verifyAccount()"
].join('\n')

replaceOne(
    'src/providers/eh-provider.ts',
    /    async search\(input: SearchRequest\) \{[\s\S]*?\n    async verifyAccount\(\)/,
    enhancedEhSearch,
    'EhProvider.search'
)

replaceOne(
    'src/library/service.ts',
    "import type { OnlineSource } from '../providers/types'",
    "import type { EhBrowseMode, OnlineSource } from '../providers/types'",
    'LibraryService provider type import'
)
replaceOne(
    'src/library/service.ts',
    /    providers\?: OnlineSource\[\]\n\}/,
    "    providers?: OnlineSource[]\n    ehMode?: EhBrowseMode\n    ehToplist?: string\n    ehLanguage?: string\n    ehExcludeTags?: string[]\n    ehMinRating?: number\n    ehPageFrom?: number\n    ehPageTo?: number\n}",
    'DiscoverQuery E-H fields'
)
replaceOne(
    'src/library/service.ts',
    /                categories: query\.categories,\n                limit: Math\.min\(query\.limit \?\? 100, 1000\)/,
    "                categories: query.categories,\n                ehMode: query.ehMode,\n                ehToplist: query.ehToplist,\n                ehLanguage: query.ehLanguage,\n                ehExcludeTags: query.ehExcludeTags,\n                ehMinRating: query.ehMinRating,\n                ehPageFrom: query.ehPageFrom,\n                ehPageTo: query.ehPageTo,\n                limit: Math.min(query.limit ?? 100, 1000)",
    'LibraryService discover provider request'
)

replaceOne(
    'src/library/server.ts',
    /                        tags: stringList\(input\.tags\),\n                        categories: stringList\(input\.categories\),\n                        sort: \(input\.sort/,
    "                        tags: stringList(input.tags),\n                        categories: stringList(input.categories),\n                        ehMode: ['latest','popular','favorites','watched','toplist'].includes(String(input.ehMode ?? '')) ? String(input.ehMode) as 'latest' | 'popular' | 'favorites' | 'watched' | 'toplist' : undefined,\n                        ehToplist: input.ehToplist ? String(input.ehToplist) : undefined,\n                        ehLanguage: input.ehLanguage ? String(input.ehLanguage) : undefined,\n                        ehExcludeTags: stringList(input.ehExcludeTags),\n                        ehMinRating: Number(input.ehMinRating ?? 0),\n                        ehPageFrom: Number(input.ehPageFrom ?? 0),\n                        ehPageTo: Number(input.ehPageTo ?? 0),\n                        sort: (input.sort",
    'Server E-H search fields'
)

console.log('V040_WEB_PARITY_BACKEND_PATCH=PASS')
