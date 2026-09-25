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

  it('keeps Main Bookshelves Shelf/Catalog preparation off the UI thread', () => {
    const main = fs.readFileSync(
      'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/MainActivity.java',
      'utf8'
    )

    expect(main).toContain('private static final class ShelfPageState')
    expect(main).toContain('private ShelfPageState readLocalShelfState()')
    expect(main).toContain('ShelfStore.Snapshot shelves=ShelfStore.load(this)')
    expect(main).toContain(
      'UnifiedCatalogStore.Snapshot catalog=UnifiedCatalogStore.load(this)'
    )
    expect(main).toContain(
      'boolean remoteConfigured=RemoteConfigStore.load(this).configured()'
    )

    const booksStart = main.indexOf('private void bookshelves(){')
    const refreshStart = main.indexOf(
      'private void refreshShelvesInto(',
      booksStart
    )
    const renderStart = main.indexOf(
      'private void renderShelves(',
      refreshStart
    )
    const nextAfterShelves = main.indexOf(
      'private RecommendationPageState readRecommendationPageState()',
      renderStart
    )
    const recommendationsStart = main.indexOf(
      'private void recommendations(){',
      renderStart
    )
    const renderEnd =
      nextAfterShelves >= 0 ? nextAfterShelves : recommendationsStart

    const booksBody = main.slice(booksStart, refreshStart)
    expect(booksBody).toContain('pending=requests.submit(()->{')
    expect(booksBody).toContain('ShelfPageState state=readLocalShelfState()')
    const submitIndex = booksBody.indexOf('pending=requests.submit(()->{')
    const syncPrefix = booksBody.slice(0, submitIndex)
    expect(syncPrefix).not.toContain('ShelfStore.load(')
    expect(syncPrefix).not.toContain('UnifiedCatalogStore.load(')
    expect(syncPrefix).not.toContain('RemoteConfigStore.load(')

    const refreshBody = main.slice(refreshStart, renderStart)
    expect(refreshBody).toContain('ShelfStore.save(this,shelves)')
    expect(refreshBody).toContain(
      'UnifiedCatalogStore.Snapshot catalog=UnifiedCatalogStore.load(this)'
    )
    expect(refreshBody).not.toContain(
      'UnifiedCatalogStore.reconcileLocalReferences(this)'
    )
    expect(refreshBody).toContain('ShelfPageState fallback=readLocalShelfState()')

    const renderBody = main.slice(renderStart, renderEnd)
    expect(renderBody).not.toContain('ShelfStore.load(')
    expect(renderBody).not.toContain('UnifiedCatalogStore.load(')
    expect(renderBody).not.toContain('RemoteConfigStore.load(')
    expect(renderBody).toContain('state.catalog.byId.get(item.comicId)')
  })

  it('keeps Main Recommendation initial local state off the UI thread', () => {
    const main = fs.readFileSync(
      'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/MainActivity.java',
      'utf8'
    )

    expect(main).toContain('private static final class RecommendationPageState')
    expect(main).toContain('private RecommendationPageState readRecommendationPageState()')
    expect(main).toContain('PortableRecommendationPackageStore.load(this)')
    expect(main).toContain('UnifiedCatalogStore.Snapshot catalog=UnifiedCatalogStore.load(this)')
    expect(main).toContain('NativeRecommendationStore.Snapshot snapshot=')
    expect(main).toContain('NativeRecommendationStore.markCurrentSeen(this)')
    expect(main).toContain('PicaClient.available(this)||portable.available()')

    const recommendationsStart = main.indexOf('private void recommendations(){')
    const renderStart = main.indexOf(
      'private void renderRecommendationPage(',
      recommendationsStart
    )
    const switchStart = main.indexOf(
      'private void switchNativeRecommendationBatch(',
      renderStart
    )

    const recommendationsBody = main.slice(recommendationsStart, renderStart)
    expect(recommendationsBody).toContain('pending=requests.submit(()->{')
    expect(recommendationsBody).toContain(
      'RecommendationPageState state=readRecommendationPageState()'
    )
    expect(recommendationsBody).toContain('if(!valid(id))return;')

    const submitIndex = recommendationsBody.indexOf(
      'pending=requests.submit(()->{'
    )
    const syncPrefix = recommendationsBody.slice(0, submitIndex)
    expect(syncPrefix).not.toContain('PortableRecommendationPackageStore.load(')
    expect(syncPrefix).not.toContain('UnifiedCatalogStore.load(')
    expect(syncPrefix).not.toContain('NativeRecommendationStore.load(')
    expect(syncPrefix).not.toContain('NativeRecommendationStore.markCurrentSeen(')

    const renderBody = main.slice(renderStart, switchStart)
    expect(renderBody).not.toContain('PortableRecommendationPackageStore.load(')
    expect(renderBody).not.toContain('UnifiedCatalogStore.load(')
    expect(renderBody).not.toContain('NativeRecommendationStore.load(')
    expect(renderBody).not.toContain('NativeRecommendationStore.markCurrentSeen(')
    expect(renderBody).toContain('NativeRecommendationStore.Snapshot snapshot=state.nativeSnapshot')
  })

  it('keeps History local JSON and catalog reads off the UI render path', () => {
    const history = fs.readFileSync(
      'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/HistoryActivity.java',
      'utf8'
    )

    expect(history).toContain('private static final class HistoryData')
    expect(history).toContain('private ReadingHistoryStore.Snapshot historySnapshot')
    expect(history).toContain('private UnifiedCatalogStore.Snapshot catalogSnapshot')
    expect(history).toContain('private HistoryData readHistoryData(boolean migrateBookmarks)')
    expect(history).toContain(
      'if(migrateBookmarks)ReadingHistoryStore.importLocalBookmarksOnce(this)'
    )
    expect(history).toContain('ReadingHistoryStore.load(this)')
    expect(history).toContain('UnifiedCatalogStore.load(this)')
    expect(history).toContain('private void loadLocalHistory(boolean migrateBookmarks)')
    expect(history).toContain('worker.submit(()->{')
    expect(history).toContain('HistoryData data=readHistoryData(migrateBookmarks)')
    expect(history).toContain('historySnapshot=data.history')
    expect(history).toContain('catalogSnapshot=data.catalog')

    const onCreateStart = history.indexOf('@Override public void onCreate')
    const onCreateEnd = history.indexOf('private Button compact(', onCreateStart)
    const onCreateBody = history.slice(onCreateStart, onCreateEnd)
    expect(onCreateBody).toContain('renderShell();')
    expect(onCreateBody).toContain('loadLocalHistory(true);')
    expect(onCreateBody).toContain('importLegacySources();')
    expect(onCreateBody).not.toContain('ReadingHistoryStore.importLocalBookmarksOnce(')
    expect(onCreateBody).not.toContain('ReadingHistoryStore.load(')
    expect(onCreateBody).not.toContain('UnifiedCatalogStore.load(')

    const renderStart = history.indexOf('private void renderList()')
    const renderEnd = history.indexOf('private void addComic(', renderStart)
    const renderBody = history.slice(renderStart, renderEnd)
    expect(renderBody).not.toContain('ReadingHistoryStore.load(')
    expect(renderBody).not.toContain('UnifiedCatalogStore.load(')
    expect(renderBody).toContain(
      'ReadingHistoryStore.filter(historySnapshot,range,exactDate,zone)'
    )
    expect(renderBody).toContain('addComic(group,zone,catalogSnapshot)')

    const importStart = history.indexOf('private void importLegacySources()')
    const importEnd = history.indexOf(
      '@Override protected void onDestroy()',
      importStart
    )
    const importBody = history.slice(importStart, importEnd)
    expect(importBody).toContain('ReadingHistoryStore.importLegacy(this,rows)')
    expect(importBody).toContain('HistoryData data=readHistoryData(false)')
    expect(importBody).toContain('historySnapshot=data.history')
    expect(importBody).toContain('catalogSnapshot=data.catalog')
  })

  it('keeps Main direct-open evidence persistence off the UI thread', () => {
    const main = fs.readFileSync(
      'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/MainActivity.java',
      'utf8'
    )

    const helperStart = main.indexOf('private void recordDetailOpenAsync(')
    const helperEnd = main.indexOf('private void openUnified(', helperStart)
    const helper = main.slice(helperStart, helperEnd)
    const openStart = helperEnd
    const openEnd = main.indexOf('private void library(){', openStart)
    const open = main.slice(openStart, openEnd)

    expect(helper).toContain('Context app=getApplicationContext();')
    expect(helper).toContain('requests.submit(()->{')
    expect(helper).toContain('UnifiedCatalogStore.load(app).byId.get(comicId)')
    expect(helper).toContain('RecommendationEvidenceStore.recordDetailOpen(')
    expect(helper).not.toContain('pending=')

    expect(open).toContain('recordDetailOpenAsync(comicId,author);')
    expect(open).toContain('startActivity(i);')
    expect(open).not.toContain('UnifiedCatalogStore.load(')
    expect(open).not.toContain('RecommendationEvidenceStore.recordDetailOpen(')
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

  it('keeps Pica Browse local render snapshots off the UI thread', () => {
    const browse = fs.readFileSync(
      'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/PicaBrowseActivity.java',
      'utf8'
    )

    expect(browse).toContain('private static final class BrowseRenderState')
    expect(browse).toContain(
      'private BrowseRenderState prepareRenderState(List<String> ids,String label,int pages)'
    )
    expect(browse).toContain('UnifiedCatalogStore.load(this)')
    expect(browse).toContain('EhSemanticStore.load(this)')
    expect(browse).toContain('EhTagTranslationStore.load(this)')
    expect(browse).toContain(
      'private void showIds(BrowseRenderState state)'
    )
    expect(browse).toContain(
      'EhTagTranslationStore.scheduleUpdate(this,this::refreshLastRenderedIds)'
    )
    expect(browse).toContain(
      'worker.submit(()->publishIds(ids,label,1))'
    )
    expect(browse).not.toContain(
      'private void showIds(List<String> ids,String label,int pages)'
    )

    const showStart = browse.indexOf(
      'private void showIds(BrowseRenderState state)'
    )
    const showEnd = browse.indexOf(
      'private void showStatus(',
      showStart
    )
    const showBody = browse.slice(showStart, showEnd)
    expect(showBody).not.toContain('UnifiedCatalogStore.load(')
    expect(showBody).not.toContain('EhSemanticStore.load(')
    expect(showBody).not.toContain('EhTagTranslationStore.load(')

    expect(browse).not.toMatch(/showIds\(\s*ids\s*,/)
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
