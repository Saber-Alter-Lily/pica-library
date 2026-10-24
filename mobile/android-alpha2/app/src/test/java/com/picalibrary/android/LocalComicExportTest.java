package com.picalibrary.android;

import static org.junit.Assert.*;
import static org.robolectric.Shadows.shadowOf;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.*;
import android.content.pm.ProviderInfo;
import android.database.Cursor;
import android.net.Uri;
import android.os.*;
import android.provider.DocumentsContract;
import android.view.View;
import android.widget.Button;
import android.widget.ListView;
import com.picalibrary.android.local.LocalComicImporter;
import java.io.*;
import java.nio.file.Files;
import java.security.MessageDigest;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.zip.*;
import org.junit.*;
import org.junit.runner.RunWith;
import org.robolectric.*;
import org.robolectric.android.controller.ActivityController;
import org.robolectric.annotation.*;
import org.robolectric.shadows.ShadowContentResolver;
import org.robolectric.shadows.ShadowAlertDialog;

/** Real synthetic SAF input/output + actual owned store, not a provider/account test. */
@RunWith(RobolectricTestRunner.class)
@Config(sdk={28,35},application=android.app.Application.class)
@LooperMode(LooperMode.Mode.PAUSED)
public class LocalComicExportTest {
    private static final String INPUT="com.picalibrary.local.export.input",OUTPUT="com.picalibrary.local.export.output";
    private static final byte[] PNG=Base64.getDecoder().decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=");
    private Context context;
    private File original,destination;
    private Uri tree,target;
    private SinkProvider sink;
    @Before public void setup() throws Exception {
        context=RuntimeEnvironment.getApplication();original=new File(context.getCacheDir(),"export-selected-original");assertTrue(original.isDirectory()||original.mkdirs());
        Files.write(new File(original,"2.png").toPath(),PNG);Files.write(new File(original,"10.png").toPath(),PNG);destination=new File(original,"exported.cbz");
        ContentProvider source=new LocalComicImportTest.SyntheticDocuments(original);register(INPUT,source);sink=new SinkProvider(destination);register(OUTPUT,sink);
        tree=DocumentsContract.buildTreeDocumentUri(INPUT,"root");target=Uri.parse("content://"+OUTPUT+"/exported.cbz");
        context.grantUriPermission(context.getPackageName(),tree,Intent.FLAG_GRANT_READ_URI_PERMISSION|Intent.FLAG_GRANT_PREFIX_URI_PERMISSION);
        context.grantUriPermission(context.getPackageName(),DocumentsContract.buildDocumentUriUsingTree(tree,"root"),Intent.FLAG_GRANT_READ_URI_PERMISSION);
        context.grantUriPermission(context.getPackageName(),DocumentsContract.buildDocumentUri(INPUT,"root/exported.cbz"),Intent.FLAG_GRANT_READ_URI_PERMISSION);
        context.grantUriPermission(context.getPackageName(),target,Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
    }
    private void register(String authority,ContentProvider provider){ProviderInfo info=new ProviderInfo();info.authority=authority;info.exported=true;info.grantUriPermissions=true;provider.attachInfo(context,info);ShadowContentResolver.registerProviderInternal(authority,provider);}
    private LocalComicStore.Comic imported() throws Exception {return LocalComicStore.confirm(context,LocalComicStore.prepare(context,tree,"folder",()->{}),()->{});}
    private Map<String,String> snapshot() throws Exception {Map<String,String> result=new TreeMap<>();walk(LocalComicStore.root(context),LocalComicStore.root(context),result);return result;}
    private void walk(File root,File current,Map<String,String> result) throws Exception {if(!current.exists())return;if(current.isDirectory()){File[] children=current.listFiles();assertNotNull(children);for(File child:children)walk(root,child,result);}else{StringBuilder digest=new StringBuilder();for(byte b:MessageDigest.getInstance("SHA-256").digest(Files.readAllBytes(current.toPath())))digest.append(String.format(Locale.ROOT,"%02x",b&255));result.put(root.toPath().relativize(current.toPath()).toString(),digest.toString());}}
    private void noScratch(){File root=new File(context.getFilesDir(),"local-comic-export-staging-v1");assertTrue(!root.exists()||Objects.requireNonNull(root.list()).length==0);}
    private void await(Callable<Boolean> ready) throws Exception {long end=System.nanoTime()+TimeUnit.SECONDS.toNanos(8);while(System.nanoTime()<end){shadowOf(Looper.getMainLooper()).idle();if(ready.call())return;Thread.sleep(10);}throw new AssertionError("Synthetic local operation did not settle");}
    @Test public void exportsOnlyBodyAndRoundTripsWithNewIdentityWithoutTouchingOldState() throws Exception {
        LocalComicStore.Comic comic=imported();UnifiedCatalogStore.Snapshot catalog=UnifiedCatalogStore.reconcileLocalReferences(context);catalog.byId.get(comic.id).tags.add("private-synthetic");UnifiedCatalogStore.save(context,catalog);
        context.getSharedPreferences("reader-bookmarks-v1",0).edit().putString("synthetic-history","keep").commit();File secret=new File(context.getFilesDir(),"synthetic-secret-canary");Files.write(secret.toPath(),new byte[]{9,8,7});Map<String,String> before=snapshot();
        String sha;
        try(LocalComicExports.Stage stage=LocalComicExports.prepare(context,comic.id,()->{})) {
            assertEquals(0,sink.opens.get());assertEquals(2,stage.result.pages);sha=stage.result.sha256;
            LocalComicExports.copyToDocument(context,stage,target,()->{});assertArrayEquals(Files.readAllBytes(stage.archive.toPath()),Files.readAllBytes(destination.toPath()));
        }
        assertEquals("wt",sink.lastMode);assertEquals(before,snapshot());assertTrue(secret.isFile());assertEquals("keep",context.getSharedPreferences("reader-bookmarks-v1",0).getString("synthetic-history",""));assertTrue(UnifiedCatalogStore.load(context).byId.get(comic.id).tags.contains("private-synthetic"));
        try(ZipFile zip=new ZipFile(destination)){assertEquals(2,zip.size());assertNotNull(zip.getEntry("2.png"));assertNotNull(zip.getEntry("10.png"));assertNull(zip.getEntry("manifest.json"));assertNull(zip.getEntry("synthetic-secret-canary"));}
        Uri cbz=DocumentsContract.buildDocumentUri(INPUT,"root/exported.cbz");LocalComicStore.Preview preview=LocalComicStore.prepare(context,cbz,"cbz",()->{});assertNotEquals(comic.id,preview.id);assertEquals(2,preview.prepared.pages.size());LocalComicStore.Comic restored=LocalComicStore.confirm(context,preview,()->{});assertArrayEquals(PNG,Files.readAllBytes(LocalComicStore.pageFile(context,restored,restored.pages.get(0)).toPath()));assertEquals(64,sha.length());noScratch();
    }
    @Test public void damagedOwnedPageFailsBeforeDestinationOpenAndKeepsPointer() throws Exception {
        LocalComicStore.Comic comic=imported();File page=LocalComicStore.pageFile(context,comic,comic.pages.get(0));Files.write(page.toPath(),new byte[PNG.length]);Map<String,String> before=snapshot();
        assertThrows(IOException.class,()->LocalComicExports.prepare(context,comic.id,()->{}));assertEquals(0,sink.opens.get());assertEquals(before,snapshot());noScratch();try(LocalComicStore.ExportLease lease=LocalComicStore.exportLease(context,comic.id)){assertEquals(comic.generation,lease.comic.generation);}
    }
    @Test public void cancelledPreparationAndRefusedDestinationPreserveOriginalAndOwnCopy() throws Exception {
        LocalComicStore.Comic comic=imported();Map<String,String> before=snapshot();AtomicInteger checks=new AtomicInteger();
        assertThrows(IOException.class,()->LocalComicExports.prepare(context,comic.id,()->{if(checks.incrementAndGet()>5)throw new IOException("cancel");}));noScratch();
        sink.refuse=true;try(LocalComicExports.Stage stage=LocalComicExports.prepare(context,comic.id,()->{})){assertThrows(Exception.class,()->LocalComicExports.copyToDocument(context,stage,target,()->{}));}
        assertEquals(before,snapshot());assertArrayEquals(PNG,Files.readAllBytes(new File(original,"2.png").toPath()));assertFalse(destination.exists());noScratch();
    }
    @Test public void copyCancellationDoesNotDeleteOrClaimSuccessForAnExternalDocument() throws Exception {
        LocalComicStore.Comic comic=imported();Map<String,String> before=snapshot();AtomicInteger checks=new AtomicInteger();
        try(LocalComicExports.Stage stage=LocalComicExports.prepare(context,comic.id,()->{})){assertThrows(IOException.class,()->LocalComicExports.copyToDocument(context,stage,target,()->{if(checks.incrementAndGet()==2)throw new IOException("cancel after open");}));}
        assertTrue(destination.isFile());assertEquals(before,snapshot());noScratch();
    }
    @Test public void changedPrivateStageFailsDigestComparisonWithoutDeletingTheExternalFile() throws Exception {
        LocalComicStore.Comic comic=imported();Map<String,String> before=snapshot();
        try(LocalComicExports.Stage stage=LocalComicExports.prepare(context,comic.id,()->{})){
            byte[] bytes=Files.readAllBytes(stage.archive.toPath());bytes[bytes.length-1]^=1;Files.write(stage.archive.toPath(),bytes);
            IOException failure=assertThrows(IOException.class,()->LocalComicExports.copyToDocument(context,stage,target,()->{}));assertEquals("Export stage changed during copy",failure.getMessage());
        }assertTrue(destination.isFile());assertEquals(before,snapshot());noScratch();
    }
    @Test public void stageLeaseProtectsAllExportWorkAndReimportDoesNotChangeSnapshot() throws Exception {
        LocalComicStore.Comic old=imported();
        try(LocalComicExports.Stage stage=LocalComicExports.prepare(context,old.id,()->{})) {
            assertThrows(LocalComicStore.ExportBusyException.class,()->LocalComicStore.remove(context,old.id));assertThrows(LocalComicStore.ExportBusyException.class,()->LocalComicExports.prepare(context,old.id,()->{}));
            Files.write(new File(original,"1.png").toPath(),PNG);LocalComicStore.Comic update=imported();assertEquals(3,update.pages.size());assertNotEquals(old.generation,update.generation);
            LocalComicExports.copyToDocument(context,stage,target,()->{});try(ZipFile zip=new ZipFile(destination)){assertEquals(2,zip.size());assertNull(zip.getEntry("1.png"));}
        }
        LocalComicStore.remove(context,old.id);assertNull(LocalComicStore.read(context,old.id));assertTrue(new File(original,"1.png").isFile());noScratch();
    }
    @Test public void destinationMustBeAnExternalContentUriAndNeverThePrivateFileProvider() throws Exception {
        LocalComicStore.Comic comic=imported();try(LocalComicExports.Stage stage=LocalComicExports.prepare(context,comic.id,()->{})){
            for(Uri uri:new Uri[]{null,Uri.parse("file:///outside"),Uri.parse("https://example.invalid/upload"),Uri.parse("content://"+context.getPackageName()+".files/internal_files/body"),Uri.parse("content://0@"+context.getPackageName()+".files/internal_files/body")})assertThrows(IOException.class,()->LocalComicExports.copyToDocument(context,stage,uri,()->{}));
        }assertEquals(0,sink.opens.get());noScratch();
    }
    @Test public void pickerIsExplicitWriteOnlyAndCancelledOrUnsolicitedResultsDoNotExport() throws Exception {
        LocalComicStore.Comic comic=imported();Intent entry=new Intent(context,LocalComicExportActivity.class).putExtra("comicId",comic.id);
        try(ActivityController<LocalComicExportActivity> controller=Robolectric.buildActivity(LocalComicExportActivity.class,entry).setup()) {
            LocalComicExportActivity activity=controller.get();LocalComicExportActivity.Session session=org.robolectric.util.ReflectionHelpers.getField(activity,"session");await(()->session.pages==2);
            activity.onActivityResult(8143,Activity.RESULT_OK,new Intent().setData(target));assertFalse(session.busy);assertEquals(0,sink.opens.get());
            activity.getWindow().getDecorView().findViewWithTag("local-export-choose").performClick();Intent intent=shadowOf(activity).getNextStartedActivityForResult().intent;
            assertEquals(Intent.ACTION_CREATE_DOCUMENT,intent.getAction());assertTrue(intent.hasCategory(Intent.CATEGORY_OPENABLE));assertEquals("application/vnd.comicbook+zip",intent.getType());assertTrue(intent.getStringExtra(Intent.EXTRA_TITLE).endsWith(".cbz"));assertTrue(intent.getBooleanExtra(Intent.EXTRA_LOCAL_ONLY,false));assertNotEquals(0,intent.getFlags()&Intent.FLAG_GRANT_WRITE_URI_PERMISSION);assertEquals(0,intent.getFlags()&(Intent.FLAG_GRANT_READ_URI_PERMISSION|Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION));
            controller.recreate();assertSame(session,org.robolectric.util.ReflectionHelpers.getField(controller.get(),"session"));controller.get().onActivityResult(8143,Activity.RESULT_CANCELED,null);assertFalse(session.picking);assertFalse(session.busy);assertEquals(0,sink.opens.get());assertNull(session.result);
        }
    }
    @Test public void retainedExportContinuesAcrossRotationAndFinishCancelsOwnedWork() throws Exception {
        LocalComicStore.Comic comic=imported();Map<String,String> before=snapshot();sink.entered=new CountDownLatch(1);sink.release=new CountDownLatch(1);
        ActivityController<LocalComicExportActivity> controller=Robolectric.buildActivity(LocalComicExportActivity.class,new Intent(context,LocalComicExportActivity.class).putExtra("comicId",comic.id)).setup();
        LocalComicExportActivity.Session session=org.robolectric.util.ReflectionHelpers.getField(controller.get(),"session");
        try {
            await(()->session.pages==2);session.export(target);assertTrue(sink.entered.await(8,TimeUnit.SECONDS));assertTrue(session.busy);controller.recreate();assertSame(session,org.robolectric.util.ReflectionHelpers.getField(controller.get(),"session"));assertFalse(session.closed);
            controller.pause().stop().destroy();await(()->!session.busy);assertTrue(session.closed);assertNull(session.result);assertEquals(before,snapshot());noScratch();
        }finally{sink.release.countDown();session.close();}
    }
    @Test public void pickerResultStartsOnlyOneExportAndNewChoiceClearsPreviousReceipt() throws Exception {
        LocalComicStore.Comic comic=imported();Map<String,String> before=snapshot();
        try(ActivityController<LocalComicExportActivity> controller=Robolectric.buildActivity(LocalComicExportActivity.class,new Intent(context,LocalComicExportActivity.class).putExtra("comicId",comic.id)).setup()){
            LocalComicExportActivity activity=controller.get();LocalComicExportActivity.Session session=org.robolectric.util.ReflectionHelpers.getField(activity,"session");await(()->session.pages==2);
            activity.getWindow().getDecorView().findViewWithTag("local-export-choose").performClick();assertNotNull(shadowOf(activity).getNextStartedActivityForResult());
            Intent response=new Intent().setData(target);activity.onActivityResult(8143,Activity.RESULT_OK,response);activity.onActivityResult(8143,Activity.RESULT_OK,response);await(()->!session.busy&&session.result!=null);assertEquals(1,sink.opens.get());assertEquals(R.string.local_export_done,session.message);assertTrue(destination.isFile());noScratch();
            shadowOf(Looper.getMainLooper()).idle();activity.getWindow().getDecorView().findViewWithTag("local-export-choose").performClick();assertNull(session.result);assertEquals(0,session.message);assertTrue(session.picking);activity.onActivityResult(8143,Activity.RESULT_CANCELED,null);assertNull(session.result);assertFalse(session.busy);assertEquals(1,sink.opens.get());assertEquals(before,snapshot());
        }
    }
    @Test public void actualImportCardOpensTheBodyExportWithOnlyTheComicIdentity() throws Exception {
        LocalComicStore.Comic comic=imported();try(ActivityController<LocalComicImportActivity> controller=Robolectric.buildActivity(LocalComicImportActivity.class).setup()){
            LocalComicImportActivity.Session session=org.robolectric.util.ReflectionHelpers.getField(controller.get(),"session");await(()->!session.comics.isEmpty());View export=controller.get().getWindow().getDecorView().findViewWithTag("local-export:"+comic.id);assertNotNull(export);export.performClick();Intent next=shadowOf(controller.get()).getNextStartedActivity();assertEquals(LocalComicExportActivity.class.getName(),next.getComponent().getClassName());assertEquals(comic.id,next.getStringExtra("comicId"));assertEquals(1,Objects.requireNonNull(next.getExtras()).keySet().size());assertEquals(0,sink.opens.get());
        }
    }
    @Test public void realDetailCopyMenuExportsOwnedImportsButNotMetadataOnlyEntries() throws Exception {
        LocalComicStore.Comic comic=imported();UnifiedCatalogStore.Snapshot catalog=UnifiedCatalogStore.reconcileLocalReferences(context);
        UnifiedCatalogStore.Entry metadata=new UnifiedCatalogStore.Entry("local:"+LocalComicImporter.hash("metadata-only"),"Metadata only","");catalog.byId.put(metadata.id,metadata);UnifiedCatalogStore.save(context,catalog);
        for(String id:new String[]{comic.id,metadata.id}){
            try(ActivityController<UnifiedComicDetailActivity> controller=Robolectric.buildActivity(UnifiedComicDetailActivity.class,new Intent(context,UnifiedComicDetailActivity.class).putExtra("comicId",id)).setup()){
                UnifiedComicDetailActivity activity=controller.get();await(()->{Button menu=org.robolectric.util.ReflectionHelpers.getField(activity,"sourceDetails");return menu!=null&&menu.isEnabled();});
                Button menu=org.robolectric.util.ReflectionHelpers.getField(activity,"sourceDetails");menu.performClick();AlertDialog dialog=ShadowAlertDialog.getLatestAlertDialog();assertTrue(dialog.isShowing());ListView list=dialog.getListView();int found=-1;
                for(int i=0;i<list.getAdapter().getCount();i++)if(activity.getString(R.string.local_export_title).equals(list.getAdapter().getItem(i)))found=i;
                if(id.equals(comic.id)){assertTrue(found>=0);list.performItemClick(list.getAdapter().getView(found,null,list),found,list.getAdapter().getItemId(found));Intent next=shadowOf(activity).getNextStartedActivity();assertEquals(LocalComicExportActivity.class.getName(),next.getComponent().getClassName());assertEquals(comic.id,next.getStringExtra("comicId"));assertEquals(1,Objects.requireNonNull(next.getExtras()).keySet().size());}
                else {assertEquals(-1,found);assertNull(shadowOf(activity).getNextStartedActivity());dialog.dismiss();}
            }
        }assertEquals(0,sink.opens.get());noScratch();
    }
    @Test public void suggestedFilenameCannotBecomeAPathOrReservedName(){assertEquals("Comic-Local comic.cbz",LocalComicExports.filename(""));String name=LocalComicExports.filename("../NUL:one/\\two\n");assertFalse(name.substring(6).contains("/"));assertFalse(name.contains("\\"));assertFalse(name.contains(":"));assertTrue(name.endsWith(".cbz"));assertTrue(LocalComicExports.filename("😀".repeat(100)).codePointCount(0,LocalComicExports.filename("😀".repeat(100)).length())<100);}
    private static final class SinkProvider extends ContentProvider {
        final File destination;final AtomicInteger opens=new AtomicInteger();volatile boolean refuse;volatile String lastMode="";CountDownLatch entered,release;
        SinkProvider(File destination){this.destination=destination;}
        public boolean onCreate(){return true;}public String getType(Uri uri){return "application/vnd.comicbook+zip";}public Cursor query(Uri u,String[] p,String s,String[] a,String o){return null;}public Uri insert(Uri u,ContentValues v){throw new UnsupportedOperationException();}public int update(Uri u,ContentValues v,String s,String[] a){throw new UnsupportedOperationException();}public int delete(Uri u,String s,String[] a){throw new AssertionError("Never delete a user-chosen document");}
        @Override public ParcelFileDescriptor openFile(Uri uri,String mode) throws FileNotFoundException {
            opens.incrementAndGet();lastMode=mode;if(!"wt".equals(mode)||refuse)throw new FileNotFoundException("Synthetic destination refused");
            if(entered!=null){entered.countDown();try{if(!release.await(8,TimeUnit.SECONDS))throw new FileNotFoundException("Synthetic destination wait expired");}catch(InterruptedException e){Thread.currentThread().interrupt();throw new FileNotFoundException("Synthetic destination cancelled");}}
            return ParcelFileDescriptor.open(destination,ParcelFileDescriptor.MODE_WRITE_ONLY|ParcelFileDescriptor.MODE_CREATE|ParcelFileDescriptor.MODE_TRUNCATE);
        }
    }
}
