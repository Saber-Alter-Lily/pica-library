import fs from 'node:fs'
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'

// Source contracts only. No javac, Gradle, Android, provider, process or listener execution.
const root = 'mobile/android-alpha2/app/src/'
const java = (name: string) =>
    fs.readFileSync(root + 'main/java/com/picalibrary/android/' + name, 'utf8')
const read = (name: string) => fs.readFileSync(name, 'utf8')
const authority = JSON.parse(read('test/fixtures/native-local-export-authority.json'))
const domain = java('local/LocalComicExporter.java')
const adapter = java('LocalComicExports.java')
const ui = java('LocalComicExportActivity.java')

describe('native local body export source contracts, not native runtime proof', () => {
    it('uses a plain Java ZIP stream module with no account, storage or network host', () => {
        const imports = [...domain.matchAll(/^import (.+);$/gm)].map(m => m[1])
        expect(imports.length).toBeGreaterThan(0)
        expect(imports.every(name => name.startsWith('java.'))).toBe(true)
        expect(domain).toContain('new ZipOutputStream(bounded,StandardCharsets.UTF_8)')
        const hostCode = domain.replace(/^package [^;]+;$/m, '')
        const forbiddenHost = /android\.|new File\(|ProcessBuilder|java\.net|SharedPreferences|UnifiedCatalogStore|BridgeClient|Database/
        expect(hostCode).not.toMatch(forbiddenHost)
        expect('import android.content.Context;').toMatch(forbiddenHost)
        expect(read('mobile/android-alpha2/app/build.gradle')).toMatch(/source fileTree\('src\/main\/java\/com\/picalibrary\/android\/local'\)[\s\S]*?classpath = files\(\)/)
    })
    it('preserves unchanged importer identity/archive/path/raster validators while sharing the bounded copier', () => {
        const importer = java('local/LocalComicImporter.java')
            .replaceAll('\r\n', '\n')
            .replace('    static String extension(', '    private static String extension(')
            .replace('    static boolean signature(', '    private static boolean signature(')
        // The generated-page port intentionally extracted the copier. Do not
        // bless a new whole-file hash: retain the old authority for untouched
        // regions, and require existing native importer/exporter tests in CI.
        const prefix = importer.slice(0, importer.indexOf('    public static Prepared prepare('))
            .replace('    public interface Progress { void page(int complete,int total); }\n', '')
        const signature = importer.slice(importer.indexOf('    private static boolean signature('))
        expect(createHash('sha256').update(prefix).digest('hex')).toBe(authority.sharedImporterParts.prefixWithoutAddedProgressPort)
        expect(createHash('sha256').update(signature).digest('hex')).toBe(authority.sharedImporterParts.signatureThroughEnd)
        const sort = 'pages.sort((a,b)->naturalCompare(a.name,b.name));'
        const inventory = importer.slice(importer.indexOf('    public static Prepared prepare('), importer.indexOf(sort) + sort.length)
        expect(createHash('sha256').update(inventory).digest('hex')).toBe(authority.sharedImporterParts.legacyInventoryThroughNaturalSort)
        expect(importer).toContain('return copyPages(title,pages,staging,cancel,false,')
        expect(importer).toContain('return copyPages(title,pages,staging,cancel,true,progress)')
        for (const check of ['count>MAX_PAGE||total>MAX_TOTAL', 'input.size>=0&&count!=input.size', 'input.crc>=0&&crc.getValue()!=input.crc', '!signature(header,headerLength,ext)', 'out.getFD().sync()', 'cancel.check();return new Prepared'])
            expect(importer).toContain(check)
        for (const helper of ['safeName', 'extension', 'naturalCompare', 'signature'])
            expect(domain).toContain('LocalComicImporter.' + helper + '(')
    })
    it('bounds actual page, total and complete compressed bytes, not just advertised lengths', () => {
        expect(domain).toContain('input.size()>LocalComicImporter.MAX_PAGES')
        expect(domain).toContain('count>LocalComicImporter.MAX_PAGE||total>LocalComicImporter.MAX_TOTAL')
        expect(domain).toContain('bytes+length>LocalComicImporter.MAX_ARCHIVE')
        expect(domain).toContain('zip.finish();zip.flush();cancel.check()')
        expect(domain).toContain('count!=page.size')
        expect(domain).toContain('crc.getValue()!=page.crc')
        expect(domain).toContain('Non-progressing export page stream')
    })
    it('emits only raster relative names and does not close the caller-owned sink', () => {
        expect(domain).toContain('new ZipEntry(page.name)')
        expect(domain).toContain('name.toLowerCase(Locale.ROOT)')
        expect(domain).toContain('LocalComicImporter.extension(name).isEmpty()')
        expect(domain).toContain('void close() throws IOException {flush();}')
        expect(domain).not.toMatch(/ComicInfo|manifest\.json|\.putExtra\(|\.getFilesDir\(/)
    })
    it('builds and syncs a completed private stage before handing it to the document writer', () => {
        expect(adapter).toContain('new File(app.getFilesDir(),"local-comic-export-staging-v1")')
        expect(adapter).toContain('UUID.randomUUID().toString()')
        expect(adapter).toContain('LocalComicStore.inside(stagingRoot,')
        expect(adapter).toContain('out.getFD().sync()')
        expect(adapter).toContain('boolean handedOff=false')
        expect(adapter).toContain('if(!handedOff)')
        expect(adapter).toContain('LocalComicStore.removeOwned(stagingRoot,work)')
        expect(ui).toMatch(/try\(LocalComicExports.Stage stage=LocalComicExports.prepare\([\s\S]*?LocalComicExports.copyToDocument\(/)
    })
    it('keeps the export lease through document copy and prevents concurrent removal', () => {
        const store = java('LocalComicStore.java')
        expect(store).toContain('if(!exports.isEmpty())throw new ExportBusyException()')
        expect(store).toContain('if(exports.contains(directory.getCanonicalPath()))throw new ExportBusyException()')
        expect(adapter).toContain('private final LocalComicStore.ExportLease lease')
        expect(adapter).toContain('finally{lease.close();}')
        expect(java('LocalComicImportActivity.java')).toContain('e instanceof LocalComicStore.ExportBusyException')
    })
    it('requests explicit create-document write access without new Android permissions', () => {
        expect(ui).toContain('Intent.ACTION_CREATE_DOCUMENT')
        expect(ui).toContain('Intent.CATEGORY_OPENABLE')
        expect(ui).toContain('"application/vnd.comicbook+zip"')
        expect(ui).toContain('Intent.EXTRA_LOCAL_ONLY,true')
        expect(ui).toContain('Intent.FLAG_GRANT_WRITE_URI_PERMISSION')
        expect(ui).not.toMatch(/FLAG_GRANT_READ_URI_PERMISSION|FLAG_GRANT_PERSISTABLE_URI_PERMISSION|takePersistableUriPermission/)
        const manifest = read(root + 'main/AndroidManifest.xml')
        expect(manifest).toContain('android:name=".LocalComicExportActivity" android:exported="false"')
        expect([...manifest.matchAll(/<uses-permission[^>]*\/>/g)].map(m => m[0]).sort()).toEqual(authority.permissions)
    })
    it('rejects path/URL and own FileProvider destinations and never deletes external documents', () => {
        expect(adapter).toContain('!"content".equals(destination.getScheme())')
        expect(adapter).toContain("authority.lastIndexOf('@')+1")
        expect(adapter).toContain('context.getPackageName()+".files"')
        expect(adapter).toContain('openOutputStream(destination,"wt")')
        expect(adapter).not.toMatch(/DocumentsContract\.deleteDocument|DocumentFile|\.delete\(|openOutputStream\(destination\)/)
        expect(adapter).toContain('!hash.toString().equals(stage.result.sha256)')
    })
    it('retains work over rotation, cancels on finish and ignores unsolicited picker callbacks', () => {
        expect(ui).toContain('onRetainNonConfigurationInstance(){return session;}')
        expect(ui).toContain('if(!isChangingConfigurations())session.close()')
        expect(ui).toContain('worker.shutdownNow()')
        expect(ui).toContain('Thread.currentThread().isInterrupted()')
        expect(ui).toContain('if(request!=CREATE_CBZ||!session.picking)return')
        expect(ui).toContain('if(busy||closed)return')
        expect(ui).not.toMatch(/getMessage\(\)|printStackTrace|Log\.[deiw]|takePersistableUriPermission/)
    })
    it('routes owned imports from cards and the copy menu, not all provider/cache rows', () => {
        expect(java('LocalComicImportActivity.java')).toContain('"local-export:"+comic.id')
        const detail = java('UnifiedComicDetailActivity.java')
        expect(detail).toContain('if(entry.localImported){rows.add(getString(R.string.local_export_title))')
        expect(detail).toContain('Intent export=new Intent(this,LocalComicExportActivity.class)')
        expect(detail).toContain('export.putExtra("comicId",entry.id)')
        expect(detail).not.toContain('export.putExtra("uri"')
        for (const source of [domain, adapter, ui])
            expect(source).not.toMatch(/BridgeClient\.|PicaClient\.|EhClient\.|JmClient\.|getSharedPreferences\(|UnifiedCatalogStore\.|PhoneDownloadStore\./)
    })
    it('ships matching en/zh/ja labels and the same receipt placeholders', () => {
        let expected: string[] | undefined
        for (const folder of ['values', 'values-zh-rCN', 'values-ja']) {
            const xml = read(root + 'main/res/' + folder + '/strings.xml')
            const items = [...xml.matchAll(/<string name="(local_export_[^"]+)"[^>]*>([\s\S]*?)<\/string>/g)]
            const names = items.map(row => row[1]).sort()
            expect(names.length).toBe(12)
            if (!expected) expected = names
            expect(names).toEqual(expected)
            expect(items.find(row => row[1] === 'local_export_receipt')?.[2].match(/%\d+\$(?:\.\d+)?[sdf]/g)).toEqual(['%1$d', '%2$d', '%3$.1f'])
            expect(read(root + 'main/res/' + folder + '/guide_strings.xml')).toContain('CBZ')
        }
    })
    it('retains real synthetic native roundtrip, failure, lifecycle and bounds tests without skips', () => {
        const native = read(root + 'test/java/com/picalibrary/android/LocalComicExportTest.java')
        const pure = read(root + 'test/java/com/picalibrary/android/local/LocalComicExporterTest.java')
        expect(native).toContain('@Config(sdk={28,35}')
        for (const caseName of ['exportsOnlyBodyAndRoundTripsWithNewIdentityWithoutTouchingOldState', 'stageLeaseProtectsAllExportWorkAndReimportDoesNotChangeSnapshot', 'retainedExportContinuesAcrossRotationAndFinishCancelsOwnedWork', 'realDetailCopyMenuExportsOwnedImportsButNotMetadataOnlyEntries'])
            expect(native).toContain('void ' + caseName + '(')
        expect(pure).toContain('limitsActualCompressedArchiveIncludingZipMetadata')
        expect(pure).toContain('readBytes.get()>=65536')
        expect(native + pure).not.toMatch(/@Ignore|Assume\.|assumeTrue|assumeFalse/)
    })
})
