package com.picalibrary.android;

import static org.junit.Assert.*;
import static org.robolectric.Shadows.shadowOf;
import android.content.*;
import android.content.pm.ProviderInfo;
import android.database.*;
import android.net.Uri;
import android.os.*;
import android.provider.DocumentsContract;
import android.provider.DocumentsProvider;
import android.view.View;
import android.widget.Button;
import com.picalibrary.android.local.LocalComicImporter;
import java.io.*;
import java.nio.file.Files;
import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.zip.*;
import org.json.*;
import org.junit.*;
import org.junit.runner.RunWith;
import org.robolectric.*;
import org.robolectric.android.controller.ActivityController;
import org.robolectric.annotation.*;
import org.robolectric.shadows.ShadowContentResolver;

/** Real synthetic DocumentsProvider → SAF copy → manifest → catalog → existing Reader path. */
@RunWith(RobolectricTestRunner.class)
@Config(sdk={28,35},application=android.app.Application.class)
@LooperMode(LooperMode.Mode.PAUSED)
public class LocalComicImportTest {
    private static final String AUTHORITY="com.picalibrary.local.tests";
    private static final byte[] PNG=Base64.getDecoder().decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=");
    private Context context;
    private File original;
    private Uri tree;
    @Before public void setup() throws Exception {
        context=RuntimeEnvironment.getApplication();original=new File(context.getCacheDir(),"selected-original");original.mkdirs();write("2.png",PNG);write("10.png",PNG);
        SyntheticDocuments provider=new SyntheticDocuments(original);ProviderInfo info=new ProviderInfo();info.authority=AUTHORITY;info.exported=true;info.grantUriPermissions=true;info.readPermission="android.permission.MANAGE_DOCUMENTS";info.writePermission=info.readPermission;provider.attachInfo(context,info);ShadowContentResolver.registerProviderInternal(AUTHORITY,provider);
        tree=DocumentsContract.buildTreeDocumentUri(AUTHORITY,"root");
        context.grantUriPermission(context.getPackageName(),tree,Intent.FLAG_GRANT_READ_URI_PERMISSION|Intent.FLAG_GRANT_PREFIX_URI_PERMISSION);
        context.grantUriPermission(context.getPackageName(),DocumentsContract.buildDocumentUriUsingTree(tree,"root"),Intent.FLAG_GRANT_READ_URI_PERMISSION);
        context.grantUriPermission(context.getPackageName(),DocumentsContract.buildDocumentUri(AUTHORITY,"root/synthetic.cbz"),Intent.FLAG_GRANT_READ_URI_PERMISSION);
        assertEquals("Synthetic picker grant",android.content.pm.PackageManager.PERMISSION_GRANTED,context.checkCallingOrSelfUriPermission(DocumentsContract.buildDocumentUriUsingTree(tree,"root"),Intent.FLAG_GRANT_READ_URI_PERMISSION));
        try(Cursor probe=context.getContentResolver().query(DocumentsContract.buildDocumentUriUsingTree(tree,"root"),new String[]{DocumentsContract.Document.COLUMN_MIME_TYPE},null,null,null)){
            assertNotNull("Provider query",probe);assertTrue("Provider root row",probe.moveToFirst());assertEquals("Provider directory MIME",DocumentsContract.Document.MIME_TYPE_DIR,probe.getString(0));
        }
    }
    private void overwriteGate(){Assume.assumeFalse("Robolectric SDK35 host AtomicFile rename-replace is unsupported on Windows; Linux CI exercises this case",Build.VERSION.SDK_INT>=35&&System.getProperty("os.name","").startsWith("Windows"));}
    private void write(String name,byte[] bytes) throws Exception {File file=new File(original,name);file.getParentFile().mkdirs();Files.write(file.toPath(),bytes);}
    private LocalComicStore.Preview preview() throws Exception{return LocalComicStore.prepare(context,tree,"folder",()->{});}
    private LocalComicStore.Comic imported() throws Exception{return LocalComicStore.confirm(context,preview(),()->{});}
    @Test public void previewIsNotLibraryAndCancelOnlyRemovesOwnScratch() throws Exception {
        LocalComicStore.Preview preview=preview();assertEquals(2,preview.prepared.pages.size());assertEquals(0,LocalComicStore.list(context).size());assertFalse(UnifiedCatalogStore.load(context).byId.containsKey(preview.id));preview.close();assertFalse(preview.work.exists());assertArrayEquals(PNG,Files.readAllBytes(new File(original,"2.png").toPath()));assertEquals(0,LocalComicStore.list(context).size());
    }
    @Test public void confirmedFolderReadsOfflineAndDoesNotExposeOriginalUris() throws Exception {
        LocalComicStore.Comic comic=imported();UnifiedCatalogStore.Entry entry=UnifiedCatalogStore.reconcileLocalReferences(context).byId.get(comic.id);assertTrue(entry.localImported);assertEquals("local",entry.providerId);assertFalse(entry.phoneDownloaded);assertFalse(entry.picaAvailable);assertFalse(entry.ehAvailable);
        LocalComicReaderSource source=new LocalComicReaderSource(context);assertNull(source.sourceAccess());List<BridgeClient.ChapterItem> chapters=source.chapters(comic.id);assertEquals(1,chapters.size());BridgeClient.ChapterData data=source.chapter(comic.id,chapters.get(0).id);assertEquals(2,data.pages.size());assertTrue(data.pages.get(0).url.startsWith("file://"));assertNotNull(LocalComicStore.cover(context,comic.id));assertNotNull(CoverRepository.cacheNow(context,entry));
        File manifest=new File(LocalComicStore.root(context),comic.id.substring(6)+"/manifest.json");String json=new String(Files.readAllBytes(manifest.toPath()),java.nio.charset.StandardCharsets.UTF_8);assertFalse(json.contains(AUTHORITY));assertFalse(json.contains("content://"));assertFalse(json.contains(original.getPath()));
        UnifiedLibraryFilter.Spec filter=new UnifiedLibraryFilter.Spec();filter.locations.add(UnifiedLibraryFilter.Location.PHONE);assertEquals(1,UnifiedLibraryFilter.apply(Collections.singletonList(entry),filter).size());assertThrows(IllegalStateException.class,()->source.image("https://example.invalid"));
    }
    @Test public void cbzUsesSameReaderAndSubfolderChapters() throws Exception {
        File archive=new File(original,"synthetic.cbz");try(ZipOutputStream out=new ZipOutputStream(new FileOutputStream(archive))){for(String name:new String[]{"chapter2/10.png","chapter1/1.png","chapter2/2.png"}){out.putNextEntry(new ZipEntry(name));out.write(PNG);out.closeEntry();}}
        Uri uri=DocumentsContract.buildDocumentUri(AUTHORITY,"root/synthetic.cbz");LocalComicStore.Preview preview=LocalComicStore.prepare(context,uri,"cbz",()->{});assertEquals(3,preview.prepared.pages.size());assertEquals(2,preview.prepared.chapters);assertFalse(new File(preview.work,"archive.cbz").exists());LocalComicStore.Comic comic=LocalComicStore.confirm(context,preview,()->{});assertEquals(2,new LocalComicReaderSource(context).chapters(comic.id).size());assertTrue(archive.exists());
    }
    @Test public void reimportKeepsIdentityTagsAndReadPageWhenEarlierPageIsInserted() throws Exception {
        overwriteGate();LocalComicStore.Comic comic=imported();LocalComicReaderSource source=new LocalComicReaderSource(context);String chapter=source.chapters(comic.id).get(0).id;ReaderProgress progress=new ReaderProgress(context,source);progress.save(comic.id,chapter,1,true);
        FavoriteCacheStore.setLocalFavorite(context,comic.id,"User title","User author",true);
        UnifiedCatalogStore.Snapshot catalog=UnifiedCatalogStore.reconcileLocalReferences(context);catalog.byId.get(comic.id).title="User title";catalog.byId.get(comic.id).tags.add("Private synthetic tag");UnifiedCatalogStore.save(context,catalog);
        String oldUri=source.chapter(comic.id,chapter).pages.get(1).url;File oldPage=LocalComicStore.pageFile(context,comic,comic.pages.get(1));write("1.png",PNG);LocalComicStore.Comic updated=imported();assertEquals(comic.id,updated.id);assertNotEquals(comic.generation,updated.generation);assertEquals(3,updated.pages.size());assertEquals(2,new ReaderProgress(context,new LocalComicReaderSource(context)).position(comic.id,chapter,0));assertTrue("Previous committed generation remains readable",oldPage.isFile());if(!System.getProperty("os.name","").startsWith("Windows"))assertTrue("Android/Linux URI path",new File(Uri.parse(oldUri).getPath()).isFile());
        UnifiedCatalogStore.Entry after=UnifiedCatalogStore.reconcileLocalReferences(context).byId.get(comic.id);assertEquals("User title",after.title);assertTrue("Original user tag retained",after.tags.contains("Private synthetic tag"));assertTrue("Persisted favorite retained",after.favorite);
    }
    @Test public void failedOrCancelledUpdateKeepsPreviousCommittedInventory() throws Exception {
        LocalComicStore.Comic before=imported();File manifest=new File(LocalComicStore.root(context),before.id.substring(6)+"/manifest.json");byte[] old=Files.readAllBytes(manifest.toPath());
        LocalComicStore.Preview preview=preview();AtomicInteger checks=new AtomicInteger();assertThrows(IOException.class,()->LocalComicStore.confirm(context,preview,()->{if(checks.incrementAndGet()==3)throw new IOException("cancel after rename");}));assertArrayEquals(old,Files.readAllBytes(manifest.toPath()));assertEquals(before.generation,LocalComicStore.read(context,before.id).generation);
        write("3.png",new byte[]{1,2,3});assertThrows(Exception.class,this::preview);assertArrayEquals(old,Files.readAllBytes(manifest.toPath()));assertTrue(new File(original,"3.png").exists());
    }
    @Test public void removalLeavesOriginalHistoryAndTagsAndNeverDeletesDesktopCopies() throws Exception {
        overwriteGate();LocalComicStore.Comic comic=imported();UnifiedCatalogStore.Snapshot catalog=UnifiedCatalogStore.reconcileLocalReferences(context);catalog.byId.get(comic.id).tags.add("Keep tag");catalog.byId.get(comic.id).desktopDownloaded=true;UnifiedCatalogStore.save(context,catalog);context.getSharedPreferences("reader-bookmarks-v1",0).edit().putString("synthetic-history","keep").commit();
        LocalComicStore.remove(context,comic.id);assertNull(LocalComicStore.read(context,comic.id));assertTrue(new File(original,"2.png").exists());UnifiedCatalogStore.Entry after=UnifiedCatalogStore.reconcileLocalReferences(context).byId.get(comic.id);assertFalse(after.localImported);assertTrue(after.desktopDownloaded);assertTrue(after.tags.contains("Keep tag"));assertEquals("keep",context.getSharedPreferences("reader-bookmarks-v1",0).getString("synthetic-history",""));assertThrows(Exception.class,()->LocalComicStore.remove(context,"../outside"));
    }
    @Test public void cancellationAfterManifestWriteRestoresPreviousPointer() throws Exception {
        overwriteGate();LocalComicStore.Comic old=imported();LocalComicStore.Preview update=preview();AtomicInteger count=new AtomicInteger();assertThrows(IOException.class,()->LocalComicStore.confirm(context,update,()->{if(count.incrementAndGet()==4)throw new IOException("cancel after manifest bytes");}));assertEquals(old.generation,LocalComicStore.read(context,old.id).generation);assertTrue(LocalComicStore.pageFile(context,old,old.pages.get(0)).isFile());assertTrue(new File(original,"2.png").isFile());
    }
    @Test public void changingCacheAndCatalogStorageDoesNotMoveOrDeleteImportedBodies() throws Exception {
        overwriteGate();LocalComicStore.Comic comic=imported();File page=LocalComicStore.pageFile(context,comic,comic.pages.get(0));ReaderImages.clearCache(context);CoverRepository.clear(context);MobileStoragePaths.migrateDataRoot(context,true);assertTrue(page.isFile());assertEquals(2,LocalComicStore.read(context,comic.id).pages.size());
    }
    @Test public void systemPickerRequestsOnlySelectedReadAccessAndUnknownSourcesFailClosed() throws Exception {
        try(ActivityController<LocalComicImportActivity> controller=Robolectric.buildActivity(LocalComicImportActivity.class).setup()){
            LocalComicImportActivity activity=controller.get();View folder=activity.getWindow().getDecorView().findViewWithTag("local-folder");folder.performClick();Intent intent=shadowOf(activity).getNextStartedActivityForResult().intent;assertEquals(Intent.ACTION_OPEN_DOCUMENT_TREE,intent.getAction());assertEquals(0,intent.getFlags()&Intent.FLAG_GRANT_WRITE_URI_PERMISSION);assertNotEquals(0,intent.getFlags()&Intent.FLAG_GRANT_READ_URI_PERMISSION);assertNotNull(activity.getWindow().getDecorView().findViewWithTag("local-cbz"));assertTrue(ReaderSourceFactory.create(context,"local") instanceof LocalComicReaderSource);
        }
    }
    @Test public void sessionRetainsPreviewUntilExplicitConfirmAndCloseDiscardsIt() throws Exception {
        LocalComicImportActivity.Session session=new LocalComicImportActivity.Session(context);session.preview=preview();LocalComicStore.Preview before=session.preview;session.close();assertFalse(before.work.exists());assertEquals(0,LocalComicStore.list(context).size());
    }
    @Test public void currentHomeShowsImportAndOwnedComicWithoutFavoriteOrProvider() throws Exception {
        overwriteGate();imported();OnboardingStore.setAutoShow(context,false);context.getSharedPreferences("pica-disclaimer-v1",0).edit().putString("accepted_version","1").commit();context.getSharedPreferences("alpha81-ui",0).edit().putBoolean("libraryRefreshed",true).commit();
        try(ActivityController<HomeActivity> controller=Robolectric.buildActivity(HomeActivity.class).setup()){
            HomeActivity activity=controller.get();shadowOf(Looper.getMainLooper()).idle();View button=activity.getWindow().getDecorView().findViewWithTag("library-local-import");assertNotNull(button);assertEquals(1,findCollection(activity.getWindow().getDecorView()).getAdapter().getItemCount());button.performClick();assertEquals(LocalComicImportActivity.class.getName(),shadowOf(activity).getNextStartedActivity().getComponent().getClassName());
        }
    }
    private androidx.recyclerview.widget.RecyclerView findCollection(View view){if(view instanceof androidx.recyclerview.widget.RecyclerView)return (androidx.recyclerview.widget.RecyclerView)view;if(view instanceof android.view.ViewGroup)for(int i=0;i<((android.view.ViewGroup)view).getChildCount();i++){androidx.recyclerview.widget.RecyclerView found=findCollection(((android.view.ViewGroup)view).getChildAt(i));if(found!=null)return found;}return null;}
    @Test public void rotationRetainsUncommittedPreviewAndExplicitDiscardIsSafe() throws Exception {
        try(ActivityController<LocalComicImportActivity> controller=Robolectric.buildActivity(LocalComicImportActivity.class).setup()){
            LocalComicImportActivity.Session session=org.robolectric.util.ReflectionHelpers.getField(controller.get(),"session");session.preview=preview();LocalComicStore.Preview before=session.preview;controller.recreate();assertSame(session,org.robolectric.util.ReflectionHelpers.getField(controller.get(),"session"));shadowOf(Looper.getMainLooper()).idle();assertTrue(before.work.isDirectory());assertEquals(0,LocalComicStore.list(context).size());controller.get().getWindow().getDecorView().findViewWithTag("local-cancel").performClick();assertFalse(before.work.exists());assertEquals(0,LocalComicStore.list(context).size());
        }
    }
    @Test public void rejectsUnsupportedFilesWithoutCatalogOrOriginalMutation() throws Exception {
        write("unsupported.pdf",new byte[]{1,2,3});Uri uri=DocumentsContract.buildDocumentUri(AUTHORITY,"root/unsupported.pdf");assertThrows(IOException.class,()->LocalComicStore.prepare(context,uri,"cbz",()->{}));assertEquals(0,LocalComicStore.list(context).size());assertTrue(new File(original,"unsupported.pdf").exists());assertThrows(IOException.class,()->LocalComicStore.prepare(context,Uri.parse("file:///outside"),"folder",()->{}));
    }
    public static final class SyntheticDocuments extends android.content.ContentProvider {
        final File root;
        SyntheticDocuments(File root){this.root=root;}
        public boolean onCreate(){return true;}
        public String getType(Uri uri){try{return file(DocumentsContract.getDocumentId(uri)).isDirectory()?DocumentsContract.Document.MIME_TYPE_DIR:"application/octet-stream";}catch(Exception e){return null;}}
        public Cursor query(Uri uri,String[] projection,String selection,String[] args,String sort){try{String id=DocumentsContract.getDocumentId(uri);return uri.getPath().endsWith("/children")?queryChildDocuments(id,projection,sort):queryDocument(id,projection);}catch(FileNotFoundException e){return cursor(projection);}}
        public Uri insert(Uri uri,ContentValues values){throw new UnsupportedOperationException();}
        public int update(Uri uri,ContentValues values,String where,String[] args){throw new UnsupportedOperationException();}
        public int delete(Uri uri,String where,String[] args){throw new UnsupportedOperationException();}
        public ParcelFileDescriptor openFile(Uri uri,String mode) throws FileNotFoundException {return openDocument(DocumentsContract.getDocumentId(uri),mode,null);}
        private File file(String id) throws FileNotFoundException {try{if(!id.equals("root")&&!id.startsWith("root/"))throw new IOException();File f=id.equals("root")?root:new File(root,id.substring(5));if(!f.getCanonicalPath().equals(root.getCanonicalPath())&&!f.getCanonicalPath().startsWith(root.getCanonicalPath()+File.separator))throw new IOException();return f;}catch(IOException e){throw new FileNotFoundException();}}
        private MatrixCursor cursor(String[] projection){return new MatrixCursor(projection==null?new String[]{DocumentsContract.Document.COLUMN_DOCUMENT_ID,DocumentsContract.Document.COLUMN_DISPLAY_NAME,DocumentsContract.Document.COLUMN_MIME_TYPE,DocumentsContract.Document.COLUMN_SIZE,DocumentsContract.Document.COLUMN_FLAGS}:projection);}
        private void row(MatrixCursor cursor,String id,File file){Map<String,Object> values=new HashMap<>();values.put(DocumentsContract.Document.COLUMN_DOCUMENT_ID,id);values.put(DocumentsContract.Document.COLUMN_DISPLAY_NAME,file.getName());values.put(DocumentsContract.Document.COLUMN_MIME_TYPE,file.isDirectory()?DocumentsContract.Document.MIME_TYPE_DIR:"application/octet-stream");values.put(DocumentsContract.Document.COLUMN_SIZE,file.length());values.put(DocumentsContract.Document.COLUMN_FLAGS,0);Object[] cells=new Object[cursor.getColumnCount()];for(int i=0;i<cells.length;i++)cells[i]=values.get(cursor.getColumnName(i));cursor.addRow(cells);}
        public Cursor queryRoots(String[] projection){return new MatrixCursor(new String[]{DocumentsContract.Root.COLUMN_ROOT_ID});}
        public Cursor queryDocument(String id,String[] projection) throws FileNotFoundException {MatrixCursor c=cursor(projection);File f=file(id);if(f.exists())row(c,id,f);return c;}
        public Cursor queryChildDocuments(String id,String[] projection,String sort) throws FileNotFoundException {MatrixCursor c=cursor(projection);File[] files=file(id).listFiles();if(files!=null)for(File child:files)row(c,id+"/"+child.getName(),child);return c;}
        public ParcelFileDescriptor openDocument(String id,String mode,CancellationSignal signal) throws FileNotFoundException {assertEquals("r",mode);return ParcelFileDescriptor.open(file(id),ParcelFileDescriptor.MODE_READ_ONLY);}
    }
}
