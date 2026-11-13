package com.picalibrary.android;

import static org.junit.Assert.*;

import android.app.Application;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.Collections;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.json.JSONArray;
import org.json.JSONObject;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;

/** All files are isolated Robolectric app data, never a real device's downloaded media. */
@RunWith(RobolectricTestRunner.class)
@Config(sdk=35,application=Application.class)
public final class PhoneDownloadStoreAtomicTest {
    private Application app;
    private File index,page;

    @Before public void prepare() throws Exception {
        app=RuntimeEnvironment.getApplication();
        StorageSettings.setDataExternal(app,false);
        index=MobileStoragePaths.dataFile(app,"phone-download-index-v1.json");
        index.getParentFile().mkdirs();
        clean();
    }

    @After public void clean(){
        if(index==null)return;
        for(String suffix:new String[]{"",".bak",".new",".tmp"})
            new File(index.getPath()+suffix).delete();
        if(page!=null)page.delete();
    }

    private static byte[] bytes(String value){return value.getBytes(StandardCharsets.UTF_8);}

    private void write(File target,String data) throws Exception {
        Files.write(target.toPath(),bytes(data));
    }

    private static String legacyIndex() throws Exception {
        JSONObject comic=new JSONObject()
            .put("id","local:old")
            .put("title","Existing download")
            .put("author","")
            .put("chapters",new JSONArray());
        return new JSONObject()
            .put("schemaVersion",1)
            .put("updatedAt","2026-01-01T00:00:00Z")
            .put("comics",new JSONArray().put(comic))
            .toString();
    }

    private static PhoneDownloadStore.Comic newComic(){
        return new PhoneDownloadStore.Comic("local:new","New download","",
            Collections.emptyList());
    }

    private static void mustReject(Runnable action){
        try{action.run();fail("Mutation of an unreadable index must fail closed");}
        catch(IllegalStateException expected){assertNotNull(expected.getMessage());}
    }

    @Test public void corruptLegacyIndexIsNeverOverwrittenOrSilentlyReconciled() throws Exception {
        byte[] original=bytes("{broken-index:unclosed");
        Files.write(index.toPath(),original);
        PhoneDownloadStore.Snapshot read=PhoneDownloadStore.load(app);
        assertTrue(read.readError);
        assertTrue(read.comics.isEmpty());
        mustReject(()->PhoneDownloadStore.put(app,newComic()));
        mustReject(()->PhoneDownloadStore.putChapter(app,"local:old","Title","",
            new PhoneDownloadStore.Chapter("chapter", "One",1,Collections.emptyList())));
        mustReject(()->PhoneDownloadStore.remove(app,"local:old"));
        mustReject(()->PhoneDownloadStore.reconcileCatalog(app));
        assertArrayEquals(original,Files.readAllBytes(index.toPath()));
        assertFalse(new File(index.getPath()+".new").isFile());
    }

    @Test public void historicalV1JsonCanBeReadAndUpdatedAtomically() throws Exception {
        write(index,legacyIndex());
        PhoneDownloadStore.Snapshot before=PhoneDownloadStore.load(app);
        assertFalse(before.readError);
        assertEquals(1,before.comics.size());
        PhoneDownloadStore.put(app,newComic());
        PhoneDownloadStore.Snapshot after=PhoneDownloadStore.load(app);
        assertFalse(after.readError);
        assertEquals(2,after.comics.size());
        assertTrue(after.comics.containsKey("local:old"));
        assertTrue(after.comics.containsKey("local:new"));
        assertEquals(1,new JSONObject(new String(Files.readAllBytes(index.toPath()),
            StandardCharsets.UTF_8)).getInt("schemaVersion"));
    }

    @Test public void atomicBackupIsRecoveredWithoutCreatingEmptyIndex() throws Exception {
        File backup=new File(index.getPath()+".bak");
        write(backup,legacyIndex());
        PhoneDownloadStore.Snapshot result=PhoneDownloadStore.load(app);
        assertFalse("Atomic backup should recover legacy index",result.readError);
        assertTrue(result.comics.containsKey("local:old"));
    }

    @Test public void interruptedOldTmpCannotBecomeAnEmptyFreshInstall() throws Exception {
        File temporary=new File(index.getPath()+".tmp");
        write(temporary,legacyIndex());
        PhoneDownloadStore.Snapshot result=PhoneDownloadStore.load(app);
        assertTrue(result.readError);
        mustReject(()->PhoneDownloadStore.put(app,newComic()));
        assertArrayEquals(bytes(legacyIndex()),Files.readAllBytes(temporary.toPath()));
        assertFalse(index.exists());
    }

    @Test public void corruptedIndexCannotCauseDeletionOfLocalDownloadedPages() throws Exception {
        page=new File(index.getParentFile(),"atomic-index-test-page.jpg");
        Files.write(page.toPath(),bytes("synthetic-page-not-user-data"));
        write(index,"{\"schemaVersion\":1,\"comics\":null}");
        mustReject(()->PhoneDownloadStore.remove(app,"local:old"));
        assertTrue(page.isFile());
        assertArrayEquals(bytes("synthetic-page-not-user-data"),
            Files.readAllBytes(page.toPath()));
    }
}
