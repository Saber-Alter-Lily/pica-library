import { EhProvider } from '../../src/providers/eh-provider'

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message)
}

const provider = new EhProvider()
let results = [] as Awaited<ReturnType<EhProvider['search']>>
for (const keyword of ['language:english', 'english', 'translated']) {
    results = await provider.search({ keyword, limit: 12 })
    if (results.length) break
}
assert(results.length > 0, 'Public E-H search returned no galleries')

const candidates = results
    .filter((comic) => (comic.pagesCount ?? 0) > 0 && Boolean(comic.coverUrl))
    .sort((a, b) => (a.pagesCount ?? Number.MAX_SAFE_INTEGER) - (b.pagesCount ?? Number.MAX_SAFE_INTEGER))
const candidate = candidates[0]
assert(candidate, 'Public E-H search returned no bounded readable gallery')
assert(candidate.providerId === 'eh', 'Search result lost E-H provider identity')
assert(candidate.completionStatus === 'UNKNOWN', 'E-H completion status must remain UNKNOWN')

const details = await provider.details(candidate.comicId)
assert(details.providerId === 'eh', 'gdata detail lost provider identity')
assert(details.comicId === candidate.comicId, 'gdata detail identity changed')
assert(details.completionStatus === 'UNKNOWN', 'gdata detail completion status changed')
assert((details.pagesCount ?? 0) > 0, 'gdata detail returned no page count')

const episodes = await provider.episodes(candidate.comicId)
assert(episodes.length === 1, 'E-H gallery must map to one synthetic chapter')
const pages = await provider.pages(candidate.comicId, episodes[0])
assert(pages.length > 0, 'E-H gallery returned no readable page locators')
assert(
    pages.length === details.pagesCount,
    `E-H page enumeration incomplete: ${pages.length}/${details.pagesCount}`
)
assert(pages[0].url.startsWith('eh-page:'), 'E-H page identity is not a stable runtime locator')

const image = await provider.fetchPage(pages[0].url, 32 * 1024 * 1024)
assert(image.data.byteLength > 0, 'E-H runtime page fetch returned empty bytes')
assert(image.contentType.startsWith('image/'), 'E-H runtime page fetch returned a non-image type')

assert(details.coverUrl, 'E-H detail returned no cover locator')
const cover = await provider.fetchCover(details.coverUrl, 8 * 1024 * 1024)
assert(cover.data.byteLength > 0, 'E-H cover fetch returned empty bytes')
assert(cover.contentType.startsWith('image/'), 'E-H cover fetch returned a non-image type')

console.log('EH_LIVE_SMOKE=PASS')
console.log(
    JSON.stringify({
        searchCount: results.length,
        pageCount: pages.length,
        syntheticEpisodeCount: episodes.length,
        pageContentType: image.contentType,
        coverContentType: cover.contentType,
        pageBytesNonZero: image.data.byteLength > 0,
        coverBytesNonZero: cover.data.byteLength > 0,
        completionStatus: details.completionStatus
    })
)
