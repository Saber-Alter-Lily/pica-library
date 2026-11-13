package com.picalibrary.android;

import static org.junit.Assert.*;
import android.content.Context;
import android.net.Uri;
import java.io.*;
import java.nio.file.Files;
import java.util.*;
import org.json.*;
import org.junit.*;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;

/** Synthetic decoded body pages only. No provider account/network or installed-app data. */
@RunWith(RobolectricTestRunner.class)
@Config(sdk=35,shadows=JmCatalogIntegrationTest.PosixAtomicRename.class)
public class JmDownloadEngineTest {
    private static int nextId=71000;
    private Context context;
    private FakeClient source;
    private Probe listener;
    // Generated 1px RGBA PNG, with valid chunk CRCs and a verified zlib stream.
    private static final byte[] PNG=Base64.getDecoder().decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4////fwAJ+wP9KobjigAAAABJRU5ErkJggg==");

    private static final class FakeClient implements JmDownloadEngine.Client {
        final String comic="jm:"+(nextId++);
        int fetched,failAt=-1; boolean changed,badLocator,emptyPages;
        byte[] bytes=PNG;
        public void check() throws Exception { if(changed)throw new JmDownloadSession.Changed(); }
        public JSONObject details(String id) throws Exception { return new JSONObject().put("comicId",comic).put("title","Synthetic download").put("author","Fixture").put("providerMetadata",new JSONObject().put("metadataCompleteness","DETAIL")); }
        public JSONArray episodes(String id) throws Exception { return new JSONArray().put(new JSONObject().put("id","jm-chapter:101").put("title","One").put("order",1)).put(new JSONObject().put("id","jm-chapter:102").put("title","Two").put("order",2)); }
        public JSONArray pages(String id) throws Exception {
            JSONArray pages=new JSONArray();if(emptyPages)return pages;
            String chapter=id.substring("jm-chapter:".length());
            for(int i=1;i<=2;i++){String locator="jm-page:"+(badLocator?"999":chapter)+":"+i;pages.put(new JSONObject().put("id",locator).put("url",locator));}return pages;
        }
        public byte[] image(String locator) throws Exception { fetched++;if(fetched==failAt)throw new IOException("Synthetic interruption");return bytes; }
    }
    private static final class Probe implements JmDownloadEngine.Listener {
        boolean stopped;int stopAfter=-1,updates;
        public boolean stopped(){return stopped;}
        public void progress(String title,String chapter,int done,int total,int pagesDone,int pagesTotal,boolean reused){updates++;if(updates==stopAfter)stopped=true;}
    }
    @Before public void setup(){context=RuntimeEnvironment.getApplication();source=new FakeClient();listener=new Probe();}
    private void run(String chapter) throws Exception {JmDownloadEngine.download(context,source,source.comic,chapter,listener);}

    @Test public void completedChapterUsesExistingOfflineReaderWithoutDesktopOrAccount() throws Exception {
        run("jm-chapter:101");
        assertEquals(2,source.fetched);assertTrue(PhoneDownloadStore.has(context,source.comic));
        PhoneDownloadReaderSource reader=new PhoneDownloadReaderSource(context);
        assertEquals(1,reader.chapters(source.comic).size());
        assertEquals(2,reader.chapter(source.comic,"jm-chapter:101").pages.size());
        assertTrue(UnifiedCatalogStore.load(context).byId.get(source.comic).phoneDownloaded);
        assertFalse(UnifiedCatalogStore.load(context).byId.get(source.comic).favorite);
        JmAccountStore.clear(context);
        assertEquals(2,reader.chapter(source.comic,"jm-chapter:101").pages.size());
    }
    @Test public void partialChapterNeverBecomesReadable() throws Exception {
        source.failAt=2;assertThrows(IOException.class,()->run("jm-chapter:101"));
        assertFalse(PhoneDownloadStore.has(context,source.comic));
        assertTrue(new PhoneDownloadReaderSource(context).chapters(source.comic).isEmpty());
        assertFalse(new JmDownloadStore(context,source.comic,"jm-chapter:101").reusable("jm-page:101:1").isEmpty());
    }
    @Test public void restartReusesVerifiedCheckpointButStillCommitsOnlyWholeChapter() throws Exception {
        source.failAt=2;assertThrows(IOException.class,()->run("jm-chapter:101"));
        source.failAt=-1;source.fetched=0;listener=new Probe();run("jm-chapter:101");
        assertEquals("Only the missing page is fetched after a new engine invocation",1,source.fetched);
        assertEquals(2,new PhoneDownloadReaderSource(context).chapter(source.comic,"jm-chapter:101").pages.size());
    }
    @Test public void nonemptyButCorruptCheckpointPageIsDownloadedAgain() throws Exception {
        source.failAt=2;assertThrows(IOException.class,()->run("jm-chapter:101"));
        String uri=new JmDownloadStore(context,source.comic,"jm-chapter:101").reusable("jm-page:101:1");
        Files.write(new File(Uri.parse(uri).getPath()).toPath(),new byte[PNG.length]);
        source.failAt=-1;source.fetched=0;run("jm-chapter:101");assertEquals(2,source.fetched);
    }
    @Test public void stoppedJobRetainsPageForExplicitResumeAndNoPartialReader() throws Exception {
        listener.stopAfter=1;assertThrows(JmDownloadEngine.Stopped.class,()->run("jm-chapter:101"));
        assertFalse(PhoneDownloadStore.has(context,source.comic));
        listener=new Probe();source.fetched=0;run("jm-chapter:101");assertEquals(1,source.fetched);
    }
    @Test public void allChaptersKeepsEarlierCompletedChapterWhenLaterOneFails() throws Exception {
        source.failAt=4;assertThrows(IOException.class,()->run(""));
        PhoneDownloadReaderSource reader=new PhoneDownloadReaderSource(context);
        assertEquals(1,reader.chapters(source.comic).size());assertEquals("jm-chapter:101",reader.chapters(source.comic).get(0).id);
        source.failAt=-1;source.fetched=0;run("");assertEquals(1,source.fetched);assertEquals(2,reader.chapters(source.comic).size());
    }
    @Test public void foreignChapterAndForeignComicCannotReachImageFetch() throws Exception {
        assertThrows(IllegalArgumentException.class,()->run("jm-chapter:999"));
        assertThrows(IllegalArgumentException.class,()->JmDownloadEngine.download(context,source,"eh:123","",listener));
        assertEquals(0,source.fetched);assertFalse(PhoneDownloadStore.has(context,source.comic));
    }
    @Test public void wholePageListValidatedBeforeFetchingAnything() throws Exception {
        source.badLocator=true;assertThrows(IOException.class,()->run("jm-chapter:101"));assertEquals(0,source.fetched);
    }
    @Test public void emptyPagesAndNonImageResponsesCannotEnterReader() throws Exception {
        source.emptyPages=true;assertThrows(IOException.class,()->run("jm-chapter:101"));
        source.emptyPages=false;source.bytes="<html>login required</html>".getBytes(java.nio.charset.StandardCharsets.UTF_8);
        assertThrows(IOException.class,()->run("jm-chapter:101"));assertFalse(PhoneDownloadStore.has(context,source.comic));
    }
    @Test public void accountChangeAfterImageFetchStopsBeforePageOrChapterCommit() throws Exception {
        JmDownloadEngine.Client switched=new JmDownloadEngine.Client(){
            public void check() throws Exception {source.check();}
            public JSONObject details(String id) throws Exception{return source.details(id);}
            public JSONArray episodes(String id) throws Exception{return source.episodes(id);}
            public JSONArray pages(String id) throws Exception{return source.pages(id);}
            public byte[] image(String locator) throws Exception{byte[] bytes=source.image(locator);source.changed=true;return bytes;}
        };
        assertThrows(JmDownloadSession.Changed.class,()->JmDownloadEngine.download(context,switched,source.comic,"jm-chapter:101",listener));
        assertFalse(PhoneDownloadStore.has(context,source.comic));
        assertEquals("",new JmDownloadStore(context,source.comic,"jm-chapter:101").reusable("jm-page:101:1"));
    }
    @Test public void sessionBindingIsStableForRestartAndInvalidatedByLoginEpochOrAccount() throws Exception {
        JmAccountStore.clear(context);String binding=JmDownloadSession.current(context);
        assertEquals(binding,JmDownloadSession.current(context));JmDownloadSession.require(context,binding);
        JmDownloadSession.invalidate(context);assertThrows(JmDownloadSession.Changed.class,()->JmDownloadSession.require(context,binding));
        String next=JmDownloadSession.current(context);JmAccountStore.sessionScope(context,"synthetic-account");
        assertThrows(JmDownloadSession.Changed.class,()->JmDownloadSession.require(context,next));
        JmAccountStore.clear(context);
    }
    @Test public void traversalAndOversizedOrFakeImagesFailClosed() throws Exception {
        assertThrows(IllegalArgumentException.class,()->new JmDownloadStore(context,"jm:../12","jm-chapter:1"));
        assertThrows(IOException.class,()->JmDownloadStore.extension(new byte[JmDownloadStore.MAX_BYTES+1]));
        byte[] fake=PNG.clone();Arrays.fill(fake,8,fake.length,(byte)0);
        assertThrows(IOException.class,()->new JmDownloadStore(context,source.comic,"jm-chapter:101").save("jm-page:101:1",0,fake));
    }
    @Test public void unreadableSelectedSafTreeDoesNotFallBackToAppStorage() throws Exception {
        StorageSettings.setDownloadTreeUri(context,"content://invalid.synthetic/tree/unwritable");
        try{assertThrows(Exception.class,()->run("jm-chapter:101"));assertFalse(PhoneDownloadStore.has(context,source.comic));
            assertEquals("",new JmDownloadStore(context,source.comic,"jm-chapter:101").reusable("jm-page:101:1"));
        }finally{StorageSettings.setDownloadTreeUri(context,"");}
    }
    @Test public void explicitRemovalDoesNotEraseFavoriteOrOtherCompletedComics() throws Exception {
        run("jm-chapter:101");String first=source.comic;
        source=new FakeClient();listener=new Probe();run("jm-chapter:101");
        JmDownloadEngine.removeCompletedDownload(context,first);
        assertFalse(PhoneDownloadStore.has(context,first));assertTrue(PhoneDownloadStore.has(context,source.comic));
        assertNotNull(UnifiedCatalogStore.load(context).byId.get(first));
    }
}
