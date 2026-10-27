import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { SUWAYOMI_QUERIES } from '../../src/source-hosts/suwayomi'
import { HOST_READER_OPERATIONS, HOST_DISCOVERY_OPERATIONS } from '../../src/source-hosts/reader-protocol'

// These are Node source/resource drift gates, NOT Android compilation or runtime tests.
const base = 'mobile/android-alpha2/app/src/'
const read = (file: string) => fs.readFileSync(base + file, 'utf8')
const java = (name: string) => read('main/java/com/picalibrary/android/' + name + '.java')
const strings = (locale: string) => Object.fromEntries([...read(`main/res/${locale}/strings_host.xml`).matchAll(/<string name="([^"]+)">([\s\S]*?)<\/string>/g)].map(row => [row[1], row[2]]))

describe('native user-Host source/resource contracts only', () => {
    it('reuses the same eight pinned operations rather than exposing an arbitrary GraphQL caller', () => {
        const raw = JSON.parse(read('main/res/raw/host_source_operations.json'))
        const { schemaVersion, upstreamCommit, ...operations } = raw
        expect(schemaVersion).toBe(1)
        expect(upstreamCommit).toBe('40bc5da57820324ed0ae724cbbc020cc4673b594')
        expect(operations).toEqual({ ...SUWAYOMI_QUERIES, ...HOST_READER_OPERATIONS, ...HOST_DISCOVERY_OPERATIONS })
        for (const operation of Object.values(operations) as Array<{ query: string }>)
            expect(operation.query).not.toMatch(/installExtension|updateManga|setSettings|enqueueDownload|updateChapter/)
    })
    it('keeps a user-entered endpoint, separate plain-LAN choice and narrow request routes', () => {
        const endpoint = java('HostEndpoint')
        expect(endpoint).toContain('allowInsecureLan')
        expect(endpoint).toContain('"basic".equals(authMode)&&!encrypted&&!loopback')
        expect(endpoint).toContain('"api/graphql".equals(route)')
        expect(endpoint).not.toMatch(/InetAddress|\.openConnection\(|https?:\/\/[a-zA-Z0-9]/)
    })
    it('stores only one disabled descriptor and never credentials or a catalogue', () => {
        const config = java('HostConfigStore'), manager = java('HostSourceManager')
        expect(config).toContain('user-host-config-v1.json')
        expect(config).toContain('value.length()!=8')
        expect(config).not.toMatch(/\.put\("(?:password|username|cookie|token|auth|catalog|books)"/i)
        expect(manager).toContain('authMode,false,allowLan)')
        expect(manager).toContain('SOURCE_HOST_READER_CONSENT_REQUIRED')
        expect(manager).toContain('session.auth=""')
        expect(manager).not.toMatch(/PicaClient|EhClient|JmClient|BridgeClient\.(?:get|post)|PicaAccountStore|EhAccountStore|JmAccountStore|WorkManager/)
    })
    it('retains legacy source IDs and reuses a generic existing request/commit guard', () => {
        const policy = java('sources/SourceAccessPolicy')
        expect(policy).toContain('Arrays.asList("pica","eh","jm")')
        expect(policy).toContain('class Permit implements Access')
        expect(java('SourceHttpConnection')).toContain('SourceAccessPolicy.Access permit')
        expect(java('HostSourceManager')).toContain('class Session implements SourceAccessPolicy.Access')
        expect(java('ReaderImages')).toContain('SourceAccess.commit(source.sourceAccess()')
    })
    it('uses exact signed-Long strings and checks source/book/chapter/page ownership', () => {
        const protocol = java('HostProtocol'), manager = java('HostSourceManager')
        expect(protocol).toContain('new BigInteger((String)value)')
        expect(protocol).toContain('Long.MIN_VALUE')
        expect(protocol).toContain('row.mangaId!=manga.id')
        expect(protocol).toContain('!selected.equals(row.source)')
        expect(protocol).toContain('actual.sourceOrder+"/page/"+i')
        expect(manager).toContain('!book.source.equals(manga.source)')
        expect(manager).toContain('!session.id.equals(row[1])')
    })
    it('retains normal TLS, rejects redirects/ambient cookies and has bounded strict JSON/raster intake', () => {
        const http = java('HostHttp'), json = java('HostJson')
        expect(http).toContain('setInstanceFollowRedirects(false)')
        expect(http).toContain('if(CookieHandler.getDefault()!=null)')
        expect(http).toContain('HostJson.object(response)')
        expect(http).toContain('20L*1024*1024')
        expect(http).not.toMatch(/TrustManager|HostnameVerifier|SSLSocketFactory|setDefault\(/)
        expect(json).toContain('reader.setLenient(false)')
        expect(json).toContain('JsonToken.END_DOCUMENT')
        expect(json).toContain('depth>32')
        expect(json).toContain('!names.add(reader.nextName())')
    })
    it('keeps process-global credential registration out of owned native source code', () => {
        const files: string[] = []
        const walk = (dir: string) => { for (const entry of fs.readdirSync(dir, { withFileTypes: true })) { const file = dir + '/' + entry.name; if (entry.isDirectory()) walk(file); else if (entry.name.endsWith('.java')) files.push(file) } }
        walk(base + 'main/java')
        for (const file of files) expect(fs.readFileSync(file, 'utf8'), file).not.toMatch(/\bAuthenticator\s*\.\s*setDefault\s*\(/)
        expect(java('HostHttp').replace(/\/\/[^\n]*/g, '')).not.toContain('Authenticator.getDefault()')
        // No hidden/reflected getter workaround and no global auth/cookie mutation.
        expect(java('HostHttp')).not.toMatch(/getDeclaredField|getDeclaredMethod|setAccessible|\.setDefault\(/)
    })
    it('routes Host content to the original Reader and never falls back to Desktop/Pica', () => {
        expect(java('ReaderSourceFactory')).toContain('case "host": return new HostReaderSource(context)')
        expect(java('ReaderSourceFactory')).toContain('default: throw new IllegalArgumentException')
        const source = java('HostReaderSource')
        expect(source).toContain('public String kind(){return "host";}')
        expect(source).not.toMatch(/WebView|BridgeClient\.(?:get|post)|PicaClient|EhClient|JmClient/)
        expect(source).toContain('public boolean emitsRecommendationEvidence(){return false;}')
        expect(java('ReaderActivity')).toContain('if(!source.emitsRecommendationEvidence())return;')
        expect(java('ReadingHistoryStore')).toContain('comic.startsWith("hosted:")')
        expect(java('HistoryActivity')).toContain('if("host".equals(row.sourceKind)){openHost(row);return;}')
        expect(java('HistoryActivity')).toContain('HostSourceManager.get(this).canResume(row.comicId)')
    })
    it('makes offline save a separately authorized selected chapter in the existing owned inventory', () => {
        const save = java('HostOfflineSaver'), store = java('LocalComicStore')
        expect(save.indexOf('if(!consent)')).toBeLessThan(save.indexOf('manager.chapter('))
        expect(save).toContain('manager.requireSession()!=session')
        expect(save).toContain('LocalComicStore.prepareRasterPages(')
        expect(save).toContain('session.commit(()->LocalComicStore.confirm(')
        expect(save).not.toMatch(/PhoneDownloadStore|WorkManager|SQLite|FileOutputStream|URLConnection\.open|new URL|saveProgress/)
        expect(store).toContain('LocalComicImporter.prepareRasterPages(')
        expect(store).toContain('pointer.finishWrite(out)')
        expect(store).toContain('removeOwned(stagingRoot,work)')
    })
    it('requires explicit screen actions and fences a stale or background save', () => {
        const screen = java('HostSourceActivity')
        const creation = screen.slice(screen.indexOf('public void onCreate('), screen.indexOf('private EditText field('))
        expect(creation).not.toMatch(/manager\.(?:start|sources|search|select)\([^)]*\);(?!return)/)
        expect(screen).toContain('username.setSaveEnabled(false);password.setSaveEnabled(false)')
        expect(screen).toContain('View.IMPORTANT_FOR_AUTOFILL_NO')
        expect(screen).toContain('private boolean current(HostSourceManager.Session grant)')
        expect(screen).toContain('if(busy)cancelTask();')
        expect(screen).toContain('activeTask.cancel(true)')
        expect(screen).toContain('ticket!=request')
        expect(screen).toContain('intent.putExtra("source","host")')
        expect(screen).toContain('putExtra("source","local")')
    })
    it('has complete Chinese/English/Japanese resources including every Host reference and format argument', () => {
        const zh = strings('values-zh-rCN'), en = strings('values'), ja = strings('values-ja')
        expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort())
        expect(Object.keys(ja).sort()).toEqual(Object.keys(zh).sort())
        const refs = new Set([...java('HostSourceActivity').matchAll(/R\.string\.(host_\w+)/g)].map(row => row[1]))
        for (const key of refs) expect(zh[key], key).toBeTruthy()
        for (const key of Object.keys(zh)) {
            expect(en[key].match(/%\d+\$[ds]/g) || []).toEqual(zh[key].match(/%\d+\$[ds]/g) || [])
            expect(ja[key].match(/%\d+\$[ds]/g) || []).toEqual(zh[key].match(/%\d+\$[ds]/g) || [])
        }
    })
    it('exposes a non-exported settings destination, not a default source or external launcher', () => {
        expect(read('main/AndroidManifest.xml')).toMatch(/<activity[^>]*android:name="\.HostSourceActivity"[^>]*android:exported="false"/)
        expect(java('AccountSourcesActivity')).toContain('HostSourceActivity.class')
        expect(java('HostSourceActivity')).not.toMatch(/suwayomi\.org|github\.com|ACTION_VIEW|ACTION_INSTALL_PACKAGE/)
    })
    it('has synthetic Android tests while refusing to label those as executed by this Node gate', () => {
        for (const name of ['HostEndpointTest', 'HostProtocolTest', 'HostHttpTest', 'HostSourceManagerTest', 'HostOfflineSaverTest', 'HostSourceActivityTest'])
            expect(read(`test/java/com/picalibrary/android/${name}.java`)).toContain('@Test')
        expect(read('test/java/com/picalibrary/android/HostTestFixture.java')).toContain('Never opens a socket')
    })
    it('cleans provisional startup and releases task UI for recoverable worker errors', () => {
        // Source-only gate. The real synthetic Error propagation/UI assertions are native tests, still NOT_RUN.
        const manager = java('HostSourceManager'), screen = java('HostSourceActivity')
        const start = manager.slice(manager.indexOf('void start('), manager.indexOf('void end()'))
        expect(start).toContain('catch(Exception|OutOfMemoryError failure){end(session);throw failure;}')
        const task = screen.slice(screen.indexOf('private void task('), screen.indexOf('private void cancelTask('))
        expect(task).toContain('catch(Exception|OutOfMemoryError failure){error=failure;}')
        expect(task).toContain('busy=false')
        expect(task).not.toContain('failure.getMessage()')
    })
})
