import fs from 'node:fs'
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'

// Source/resource boundaries and shared identity only; never claim Android runtime coverage.
const root = 'mobile/android-alpha2/app/src/'
const java = (name: string, test = false) => fs.readFileSync(root + (test ? 'test' : 'main') + '/java/com/picalibrary/android/' + name + '.java', 'utf8')
const storage = java('HostSavedBooks'), manager = java('HostSourceManager'), screen = java('HostSourceActivity')
const hash = (text: string) => createHash('sha256').update(text).digest('hex')

describe('native explicitly saved Host references — source/identity/resource contracts, not runtime', () => {
    it('matches the existing Desktop/native identity formula without title or numeric Long conversion', () => {
        const digest = hash('/owned-synthetic-book/1')
        const id = 'hosted:64d223e0-5d29-4320-babb-5a2da654d345:' + hash(JSON.stringify(['a'.repeat(64), '-9223372036854775808', digest]))
        expect(java('HostSavedBooksTest', true)).toContain('CANONICAL_ID="' + id + '"')
        expect(storage).toContain('new JSONArray().put(principal).put(sourceId).put(urlDigest)')
        expect(storage).toContain('this.sourceId=HostProtocol.sourceId(sourceId)')
        expect(storage).not.toMatch(/parseLong\(sourceId|parseDouble\(sourceId|title\).*hash/)
    })
    it('is a bounded AtomicFile locator adapter, not another catalogue, permissions or downloader', () => {
        expect(storage).toContain('new AtomicFile(')
        expect(storage).toContain('user-host-saved-books-v1.json')
        expect(storage).toContain('MAX_BOOKS=500,MAX_BYTES=2*1024*1024')
        expect(storage).toContain('HostJson.object(bytes)')
        expect(storage).toContain('file.failWrite(out)')
        expect(storage).not.toMatch(/PicaClient|EhClient|JmClient|SourceHostManager|HostHttp|ReaderActivity|PhoneDownloadStore|UnifiedCatalogStore|WorkManager|\.openConnection\(|https?:\/\//)
    })
    it('persists only nine whitelisted reference fields with strict root and entry validation', () => {
        const serializer = storage.slice(storage.indexOf('JSONObject json()'), storage.indexOf('static Book parse'))
        expect([...serializer.matchAll(/\.put\("([^"]+)"/g)].map(row => row[1])).toEqual(['comicId', 'connectionId', 'principal', 'sourceId', 'remoteId', 'urlDigest', 'title', 'hostLabel', 'savedAt'])
        expect(storage).toContain('row.length()!=9'); expect(storage).toContain('root.length()!=2')
        expect(storage).toContain('if(!ids.add(book.comicId))throw invalid()')
        expect(storage).not.toMatch(/\.put\("(?:password|username|auth|cookie|token|sessionId|pages|endpoint|url)"/)
    })
    it('never silently replaces corrupt files, resets a collection or evicts a pinned book at capacity', () => {
        expect(storage).toContain('if(rows.size()>=MAX_BOOKS)throw new Full()')
        expect(storage).toContain('static final class Full extends IOException')
        expect(screen).toContain('failure instanceof HostSavedBooks.Full')
        expect(storage).not.toMatch(/delete\(|clear\(|catch\([^)]*\)\{return new ArrayList/)
        expect(java('HostSavedBooksTest', true)).toContain('assertArrayEquals(before,Files.readAllBytes(file.toPath()))')
    })
    it('pins only selected books inside the existing revocation-fenced session and with separate consent', () => {
        const save = manager.slice(manager.indexOf('HostSavedBooks.Book saveBook('), manager.indexOf('void removeSavedBook('))
        expect(save.indexOf('if(!consent)')).toBeLessThan(save.indexOf('Session session=requireSession()'))
        expect(save).toContain('Book book=selected(session,comicId)')
        expect(save).toContain('session.commit(()->savedBooks.put(')
        expect(save).not.toMatch(/rpc\(|search\(|PhoneDownload|UnifiedCatalog/)
    })
    it('reads/removes local records without a session and revalidates stored identity on explicit resume', () => {
        expect(manager).toContain('List<HostSavedBooks.Book> savedBooks()throws Exception {return savedBooks.load();}')
        const remove = manager.slice(manager.indexOf('void removeSavedBook('), manager.indexOf('synchronized boolean canResumeSaved('))
        expect(remove).not.toMatch(/requireSession|rpc\(|\.end\(/)
        expect(manager).toContain('saved.connectionId.equals(session.host.id)&&saved.principal.equals(session.principal)&&saved.sourceId.equals(session.sourceId)')
        const resume = manager.slice(manager.indexOf('void resumeSavedBook('), manager.indexOf('void select('))
        expect(resume).toContain('session.commit('); expect(resume).toContain('select(session,book.id)')
        expect(manager).toContain('void select(String comicId)throws Exception {select(requireSession(),comicId);}')
        expect(resume).not.toMatch(/search\(|fetchMangaAndChapters|Book.*title.*equals/)
    })
    it('wires actual library/search/read/remove UI with local paging and reauthorization instead of auto-connect', () => {
        expect(java('MainActivity')).toContain('button(getString(R.string.host_books_title),v->startActivity(new Intent(this,HostSourceActivity.class)))')
        for (const route of ['manager.saveBook(book.id,true)', 'manager.resumeSavedBook(book.comicId,true)', 'manager.removeSavedBook(book.comicId,true)', 'if(!manager.canResumeSaved(book))']) expect(screen).toContain(route)
        expect(screen).toContain('savedOffset+12<savedSnapshot.size()')
        expect(screen).toContain('ticket!=savedRequest')
        const resume = screen.slice(screen.indexOf('@Override protected void onResume()'), screen.indexOf('@Override protected void onStop()'))
        expect(resume).toContain('reloadSavedBooks()'); expect(resume).not.toMatch(/manager\.start|manager\.search|manager\.bind/)
    })
    it('provides all three locale messages for explicit reference/download/deletion/permission distinctions', () => {
        const refs = new Set([...screen.matchAll(/R\.string\.(host_book(?:s)?_\w+)/g)].map(row => row[1]))
        expect(refs.size).toBe(11)
        for (const locale of ['values', 'values-zh-rCN', 'values-ja']) {
            const xml = fs.readFileSync(root + `main/res/${locale}/strings_host.xml`, 'utf8')
            for (const name of refs) expect(xml).toContain(`name="${name}"`)
            expect(xml).toContain('%1$d–%2$d / %3$d')
        }
    })
})
