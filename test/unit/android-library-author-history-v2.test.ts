import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('Android Library / Author / History V2 contracts', () => {
  it('separates replica location from online provider and keeps sorting outside active filters', () => {
    const filter = fs.readFileSync('mobile/android-alpha2/app/src/main/java/com/picalibrary/android/UnifiedLibraryFilter.java','utf8')
    const store = fs.readFileSync('mobile/android-alpha2/app/src/main/java/com/picalibrary/android/UnifiedFilterStore.java','utf8')
    const dialog = fs.readFileSync('mobile/android-alpha2/app/src/main/java/com/picalibrary/android/UnifiedLibraryFilterDialog.java','utf8')
    expect(filter).toContain('enum Location { PHONE, DESKTOP, WEBDAV, ONLINE }')
    expect(filter).toContain('enum Provider { PICA, EH, EXH }')
    expect(filter).not.toContain('enum Source {')
    expect(store).toContain('legacy.contains("PICA")')
    expect(store).toContain('Location.ONLINE')
    expect(store).toContain('Provider.PICA')
    expect(dialog).toContain('"更多筛选"')
    expect(dialog).not.toContain('section(root,activity,"排序")')
  })

  it('keeps library chrome compact and restores history outside bottom navigation', () => {
    const home = fs.readFileSync('mobile/android-alpha2/app/src/main/java/com/picalibrary/android/HomeActivity.java','utf8')
    const shell = fs.readFileSync('mobile/android-alpha2/app/src/main/java/com/picalibrary/android/ShellPolicy.java','utf8')
    const manifest = fs.readFileSync('mobile/android-alpha2/app/src/main/AndroidManifest.xml','utf8')
    expect(home).toContain('compact("历史",v->startActivity(new Intent(this,HistoryActivity.class)))')
    expect(home).toContain('compact("书架",v->{showingShelves=true;show();})')
    expect(home).toContain('compact("显示",v->chooseCollectionMode())')
    expect(home).toContain('Ui.iconButton(this,R.drawable.ic_refresh_24,"刷新书库"')
    expect(home).not.toContain('compact("⋮",v->showLibraryMenu())')
    expect(home).toContain('UnifiedLibraryFilter.sortLabel(librarySpec.sort)+" ▾"')
    expect(home).toContain('private void chooseLibrarySort()')
    expect(shell).toContain('{"书库","推荐","在线","设置"}')
    expect(shell).not.toContain('历史')
    expect(manifest).toContain('.HistoryActivity')
  })

  it('uses an auditable creator concept and two-stage creator navigation', () => {
    const concepts = fs.readFileSync('mobile/android-alpha2/app/src/main/java/com/picalibrary/android/AuthorConceptStore.java','utf8')
    const detail = fs.readFileSync('mobile/android-alpha2/app/src/main/java/com/picalibrary/android/UnifiedComicDetailActivity.java','utf8')
    const directory = fs.readFileSync('mobile/android-alpha2/app/src/main/java/com/picalibrary/android/AuthorDirectoryActivity.java','utf8')
    const works = fs.readFileSync('mobile/android-alpha2/app/src/main/java/com/picalibrary/android/AuthorWorksActivity.java','utf8')
    expect(concepts).toContain('final class AuthorConceptStore')
    expect(concepts).toContain('"artist:"+name,"artist"')
    expect(concepts).toContain('"group:"+name,"group"')
    expect(detail).toContain('AuthorDirectoryActivity.class')
    expect(directory).toContain('AuthorWorksActivity.class')
    expect(directory).toContain('"本作作者"')
    expect(works).toContain('AuthorConceptStore.queryForPica(concept)')
    expect(works).toContain('AuthorConceptStore.queryForEh(concept)')
    expect(works).toMatch(/EhCapabilityStore\.refresh\(\s*this,\s*false\s*\)/)
  })

  it('keeps Author Directory creator-concept construction off the UI thread', () => {
    const directory = fs.readFileSync(
      'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/AuthorDirectoryActivity.java',
      'utf8'
    )

    expect(directory).toContain('Executors.newSingleThreadExecutor()')
    expect(directory).toContain('private void loadSnapshot()')
    expect(directory).toContain(
      'UnifiedCatalogStore.Snapshot catalog=UnifiedCatalogStore.load(this)'
    )
    expect(directory).toContain(
      'EhSemanticStore.Snapshot semantics=EhSemanticStore.load(this)'
    )
    expect(directory).toContain(
      'AuthorConceptStore.Snapshot next=AuthorConceptStore.build(catalog,semantics)'
    )
    expect(directory).toContain('worker.submit(()->{')
    expect(directory).toContain('if(destroyed||generation!=loadGeneration)return')
    expect(directory).toContain('LocalizedText.ui("正在读取作者目录…")')
    expect(directory).not.toContain('AuthorConceptStore.build(this)')

    const onCreateStart = directory.indexOf('@Override public void onCreate')
    const onCreateEnd = directory.indexOf('private void render()', onCreateStart)
    const onCreateBody = directory.slice(onCreateStart, onCreateEnd)
    expect(onCreateBody).toContain('render();')
    expect(onCreateBody).toContain('loadSnapshot();')
    expect(onCreateBody).not.toContain('UnifiedCatalogStore.load(')
    expect(onCreateBody).not.toContain('EhSemanticStore.load(')
    expect(onCreateBody).not.toContain('AuthorConceptStore.build(')

    expect(directory).toContain(
      '@Override protected void onDestroy(){\n        destroyed=true;\n        loadGeneration++;\n        worker.shutdownNow();'
    )
  })

  it('keeps Author Works catalog and creator rebuilds off the UI render path', () => {
    const works = fs.readFileSync('mobile/android-alpha2/app/src/main/java/com/picalibrary/android/AuthorWorksActivity.java','utf8')
    expect(works).toContain('private static final class LocalState')
    expect(works).toContain('private LocalState readLocalState()')
    expect(works).toContain('UnifiedCatalogStore.Snapshot nextCatalog =')
    expect(works).toContain('EhSemanticStore.Snapshot semantics = EhSemanticStore.load(this)')
    expect(works).toContain('AuthorConceptStore.build(nextCatalog, semantics)')
    expect(works).toContain('worker.submit(() -> {')
    expect(works).toContain('LocalState next = readLocalState();')
    expect(works).not.toContain('AuthorConceptStore.build(this)')

    const renderStart = works.indexOf('private void renderWorks()')
    const renderEnd = works.indexOf('private boolean bindingMatches(', renderStart)
    const renderBody = works.slice(renderStart, renderEnd)
    expect(renderBody).not.toContain('UnifiedCatalogStore.load(')
    expect(renderBody).not.toContain('EhSemanticStore.load(')
    expect(renderBody).not.toContain('AuthorConceptStore.build(')

    const onCreateStart = works.indexOf('@Override public void onCreate')
    const onCreateEnd = works.indexOf('private Button compact(', onCreateStart)
    const onCreateBody = works.slice(onCreateStart, onCreateEnd)
    expect(onCreateBody).toContain('renderShell();')
    expect(onCreateBody).toContain('loadLocalState(true);')
    expect(onCreateBody).not.toContain('UnifiedCatalogStore.load(')
    expect(onCreateBody).not.toContain('AuthorConceptStore.build(')
  })

  it('keeps Comic Detail startup local-state IO off the UI thread', () => {
    const detail = fs.readFileSync('mobile/android-alpha2/app/src/main/java/com/picalibrary/android/UnifiedComicDetailActivity.java','utf8')
    expect(detail).toContain('private static final class LocalDetailState')
    expect(detail).toContain('private LocalDetailState readLocalDetailState(')
    expect(detail).toContain('UnifiedCatalogStore.Snapshot catalog=UnifiedCatalogStore.load(this)')
    expect(detail).toContain('EhSemanticStore.Snapshot semantics=EhSemanticStore.load(this)')
    expect(detail).toContain('AuthorConceptStore.build(catalog,semantics)')
    expect(detail).toContain('boolean phoneDownloaded=PhoneDownloadStore.has(this,local.id)')
    expect(detail).toContain('worker.submit(()->{')
    expect(detail).toContain('LocalDetailState state=readLocalDetailState(')
    expect(detail).toContain('renderLoadingShell(entry.title)')
    expect(detail).toContain('resolveSources(state.phoneDownloaded)')

    const onCreateStart = detail.indexOf('@Override public void onCreate')
    const onCreateEnd = detail.indexOf('private void renderLoadingShell', onCreateStart)
    const onCreateBody = detail.slice(onCreateStart, onCreateEnd)
    expect(onCreateBody).not.toContain('UnifiedCatalogStore.load(')
    expect(onCreateBody).not.toContain('AuthorConceptStore.build(')
    expect(onCreateBody).not.toContain('PhoneDownloadStore.has(')

    const authorStart = detail.indexOf('private String authorSummary()')
    const authorEnd = detail.indexOf('private void openAuthors()', authorStart)
    expect(detail.slice(authorStart, authorEnd)).not.toContain('AuthorConceptStore.build(')

    const tagStart = detail.indexOf('private String tagLine()')
    const tagEnd = detail.indexOf('private String workVariantRelation(', tagStart)
    expect(detail.slice(tagStart, tagEnd)).not.toContain('EhSemanticStore.')
    expect(detail.slice(tagStart, tagEnd)).not.toContain('EhTagTranslationStore.')

    const variantStart = detail.indexOf('private UnifiedCatalogStore.Entry workVariantEntry(')
    const variantEnd = detail.indexOf('private void openWorkVariant(', variantStart)
    expect(detail.slice(variantStart, variantEnd)).not.toContain('UnifiedCatalogStore.load(')

    const sourcesStart = detail.indexOf('private void resolveSources(')
    const sourcesEnd = detail.indexOf('private ProbeResult probe(', sourcesStart)
    expect(detail.slice(sourcesStart, sourcesEnd)).not.toContain('PhoneDownloadStore.has(')
  })

  it('keeps Main Library local catalog reconciliation off the UI thread', () => {
    const main = fs.readFileSync(
      'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/MainActivity.java',
      'utf8'
    )

    const libraryStart = main.indexOf('private void library(){')
    const libraryEnd = main.indexOf('private void renderUnifiedLibrary(', libraryStart)
    const libraryBody = main.slice(libraryStart, libraryEnd)

    expect(libraryBody).toContain('final int id=serial;')
    expect(libraryBody).toContain('pending=requests.submit(()->{')
    expect(libraryBody).toContain(
      'UnifiedCatalogStore.Snapshot local=UnifiedCatalogStore.reconcileLocalReferences(this)'
    )
    expect(libraryBody).toContain('runOnUiThread(()->{')
    expect(libraryBody).toContain('if(!valid(id))return;')
    expect(libraryBody).toContain(
      'renderUnifiedLibrary(g,status,local,"本地目录")'
    )

    const submitIndex = libraryBody.indexOf('pending=requests.submit(()->{')
    const reconcileIndex = libraryBody.indexOf(
      'UnifiedCatalogStore.Snapshot local=UnifiedCatalogStore.reconcileLocalReferences(this)'
    )
    expect(reconcileIndex).toBeGreaterThan(submitIndex)

    const uiPrefix = libraryBody.slice(0, submitIndex)
    expect(uiPrefix).not.toContain('UnifiedCatalogStore.reconcileLocalReferences(')
  })

  it('prepares Main Settings file and stat summaries off the UI thread', () => {
    const main = fs.readFileSync(
      'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/MainActivity.java',
      'utf8'
    )

    expect(main).toContain('private static final class SettingsSummary')
    expect(main).toContain('private Future<?> settingsSummaryTask;')
    expect(main).toContain('private SettingsSummary readSettingsSummary(){')
    expect(main).toContain('FavoriteCacheStore.Snapshot favorites=FavoriteCacheStore.load(this)')
    expect(main).toContain('long coverBytes=CoverRepository.diskBytes(this)')
    expect(main).toContain('RemoteConfigStore.Config remote=RemoteConfigStore.load(this)')
    expect(main).toContain('PicaAccountStore.Session pica=PicaAccountStore.load(this)')
    expect(main).toContain('NativeRecommendationStore.Snapshot recommendation=NativeRecommendationStore.load(this)')
    expect(main).toContain('PhoneDownloadStore.Snapshot downloads=PhoneDownloadStore.load(this)')
    expect(main).toContain('PhoneDownloadStore.estimatedBytes(this,downloads)')
    expect(main).toContain('StoragePolicy.Usage storage=StoragePolicy.usage(this)')
    expect(main).toContain('settingsSummaryTask=requests.submit(()->{')
    expect(main).toContain('SettingsSummary summary=readSettingsSummary();')
    expect(main).toContain('if(!valid(id))return;')

    const sourcesStart = main.indexOf('private void sources(){')
    const summarySubmit = main.indexOf(
      'settingsSummaryTask=requests.submit(()->{',
      sourcesStart
    )
    const sourcesEnd = main.indexOf('private String formatBytes', sourcesStart)
    const syncPrefix = main.slice(sourcesStart, summarySubmit)
    const sourcesBody = main.slice(sourcesStart, sourcesEnd)

    expect(syncPrefix).not.toContain('FavoriteCacheStore.load(')
    expect(syncPrefix).not.toContain('CoverRepository.diskBytes(')
    expect(syncPrefix).not.toContain('RemoteConfigStore.load(')
    expect(syncPrefix).not.toContain('PicaAccountStore.load(')
    expect(syncPrefix).not.toContain('NativeRecommendationStore.load(')
    expect(syncPrefix).not.toContain('PhoneDownloadStore.load(')
    expect(syncPrefix).not.toContain('PhoneDownloadStore.estimatedBytes(')
    expect(syncPrefix).not.toContain('StoragePolicy.usage(')
    expect(sourcesBody).toContain('pending=requests.submit(()->{')
    expect(sourcesBody).toContain('settingsSummaryTask=requests.submit(()->{')

    expect(main).toContain(
      'if(settingsSummaryTask!=null)settingsSummaryTask.cancel(true)'
    )
    expect(main).toContain('settingsSummaryTask=null')
  })

  it('records session history separately from bookmarks and supports exact-date resume', () => {
    const progress = fs.readFileSync('mobile/android-alpha2/app/src/main/java/com/picalibrary/android/ReaderProgress.java','utf8')
    const store = fs.readFileSync('mobile/android-alpha2/app/src/main/java/com/picalibrary/android/ReadingHistoryStore.java','utf8')
    const history = fs.readFileSync('mobile/android-alpha2/app/src/main/java/com/picalibrary/android/HistoryActivity.java','utf8')
    expect(progress).toContain('ReadingHistoryStore.record(')
    expect(progress).toContain('historyChapterId')
    expect(progress).toContain('seedOneShotPosition')
    expect(store).toContain('enum Range { TODAY, DAYS_7, DAYS_30, ALL }')
    expect(store).toContain('legacySnapshot')
    expect(history).toContain('new DatePickerDialog(')
    expect(history).toContain('ReadingHistoryStore.Range.DAYS_30')
    expect(history).toContain('ReaderProgress.seedOneShotPosition(this,row.comicId,row.chapterId,row.lastPage)')
  })

  it('groups mobile history by comic, shows covers and preserves chapter metadata', () => {
    const reader = fs.readFileSync('mobile/android-alpha2/app/src/main/java/com/picalibrary/android/ReaderActivity.java','utf8')
    const progress = fs.readFileSync('mobile/android-alpha2/app/src/main/java/com/picalibrary/android/ReaderProgress.java','utf8')
    const store = fs.readFileSync('mobile/android-alpha2/app/src/main/java/com/picalibrary/android/ReadingHistoryStore.java','utf8')
    const history = fs.readFileSync('mobile/android-alpha2/app/src/main/java/com/picalibrary/android/HistoryActivity.java','utf8')
    expect(reader).toContain('chapterAdvance.setText(LocalizedText.ui("下一章 · ")+target.title)')
    expect(reader).toContain('progress.chapterMetadata(data.episode.id,data.episode.title,data.episode.order)')
    expect(reader).toContain('if(atChapterEnd())setChrome(true)')
    expect(progress).toContain('void chapterMetadata(String chapterId,String chapterTitle,int chapterOrder)')
    expect(store).toContain('chapterOrder')
    expect(store).toContain('o.put("chapterOrder",v.chapterOrder)')
    expect(history).toContain('List<ComicHistory> groups=grouped(rows)')
    expect(history).toContain('CoverRepository.load(this,cover')
    expect(history).toContain('"已记录 "+chapters.size()+" 个章节')
    expect(history).toContain('setTitle(group.latest.title+LocalizedText.ui(" · 章节记录"))')
    expect(history).not.toContain('private void addSession(')
  })

  it('keeps E-H browse and filter compact actions in one row', () => {
    const browse = fs.readFileSync('mobile/android-alpha2/app/src/main/java/com/picalibrary/android/PicaBrowseActivity.java','utf8')
    expect(browse).toContain('Button browse=button("浏览"')
    expect(browse).toContain('Button filter=button(filterLabel()')
    expect(browse).toContain('browse.setSingleLine(true)')
    expect(browse).toContain('filter.setSingleLine(true)')
    expect(browse).not.toContain('LinearLayout filterRow=')
  })
})
