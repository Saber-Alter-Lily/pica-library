package com.picalibrary.android;

import static org.junit.Assert.*;

import android.app.Application;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;

/** Original shared shelf format, only in Robolectric's disposable app files. */
@RunWith(RobolectricTestRunner.class)
@Config(sdk=35,application=Application.class)
public final class ShelfLedgerAtomicTest {
    private File shelf;

    @Before public void setup(){
        Application app=RuntimeEnvironment.getApplication();
        shelf=new File(app.getFilesDir(),ShelfLedger.FILE);
        clean();
    }

    @After public void clean(){
        if(shelf==null)return;
        for(String suffix:new String[]{"",".bak",".new",".tmp"})
            new File(shelf.getPath()+suffix).delete();
    }

    private static String oldShelf() throws Exception {
        JSONObject legacy=new JSONObject()
            .put("id","old-shelf")
            .put("name","Existing shelf")
            .put("updatedAt","2026-01-01T00:00:00Z")
            .put("items",new JSONArray());
        return new JSONObject()
            .put("schemaVersion",2)
            .put("updatedAt","2026-01-01T00:00:00Z")
            .put("shelves",new JSONArray().put(legacy))
            .toString();
    }

    private static void reject(Runnable mutation){
        try{mutation.run();fail("Unreadable shelf must not be overwritten");}
        catch(IllegalStateException expected){assertNotNull(expected.getMessage());}
    }

    @Test public void malformedExistingShelfBlocksNewWrite() throws Exception {
        byte[] before="{unfinished-shelf-json".getBytes(StandardCharsets.UTF_8);
        Files.write(shelf.toPath(),before);
        reject(()->ShelfLedger.create(shelf,"New"));
        assertArrayEquals(before,Files.readAllBytes(shelf.toPath()));
    }

    @Test public void originalSchemaTwoShelfSurvivesAtomicEdit() throws Exception {
        Files.write(shelf.toPath(),oldShelf().getBytes(StandardCharsets.UTF_8));
        assertEquals(1,ShelfLedger.load(shelf).activeShelves().size());
        ShelfLedger.create(shelf,"New");
        ShelfLedger.Snapshot result=ShelfLedger.load(shelf);
        assertEquals(2,result.activeShelves().size());
        assertTrue(result.activeShelves().stream()
            .anyMatch(item->"Existing shelf".equals(item.name)));
        assertFalse(new File(shelf.getPath()+".bak").exists());
    }

    @Test public void interruptedBackupRecoversAndOrphanLegacyTmpIsNotErased()
            throws Exception {
        File backup=new File(shelf.getPath()+".bak");
        Files.write(backup.toPath(),oldShelf().getBytes(StandardCharsets.UTF_8));
        assertEquals(1,ShelfLedger.load(shelf).activeShelves().size());
        clean();
        File oldTmp=new File(shelf.getPath()+".tmp");
        byte[] original=oldShelf().getBytes(StandardCharsets.UTF_8);
        Files.write(oldTmp.toPath(),original);
        reject(()->ShelfLedger.create(shelf,"New"));
        assertArrayEquals(original,Files.readAllBytes(oldTmp.toPath()));
        assertFalse(shelf.exists());
    }
}
