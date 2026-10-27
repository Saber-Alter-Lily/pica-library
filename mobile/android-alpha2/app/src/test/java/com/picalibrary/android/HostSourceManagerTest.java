package com.picalibrary.android;

import static org.junit.Assert.*;
import static org.robolectric.Shadows.shadowOf;
import android.content.Context;
import android.os.Looper;
import java.io.*;
import java.net.HttpURLConnection;
import java.nio.file.Files;
import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.*;
import org.junit.runner.RunWith;
import org.robolectric.*;
import org.robolectric.annotation.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk=28,application=android.app.Application.class)
@LooperMode(LooperMode.Mode.PAUSED)
public class HostSourceManagerTest {
    private Context context;private HostTestFixture fixture;
    @Before public void setup()throws Exception {context=RuntimeEnvironment.getApplication();fixture=new HostTestFixture(context);}
    @After public void end(){fixture.manager.end();HostSourceManager.resetForTests();}
    @Test public void unknownMetadataSurvivesReaderFilteringThenExplicitFetchResolvesRealPages()throws Exception {
        fixture.unknownPageCount=true;HostSourceManager.Book book=fixture.selected();HostReaderSource source=new HostReaderSource(fixture.manager);
        BridgeClient.ChapterItem chapter=source.chapters(book.id).get(0);assertEquals(-1,chapter.downloadedPictures);assertTrue(ReaderPolicy.canFetchChapter(source.kind(),chapter.downloadedPictures));
        BridgeClient.ChapterData ready=source.chapter(book.id,chapter.id);assertEquals(2,ready.pages.size());assertEquals(2,ready.episode.downloadedPictures);
        HttpURLConnection image=source.image(ready.pages.get(1).url);try(InputStream in=image.getInputStream()){assertEquals(137,in.read());}finally{image.disconnect();}
    }
    @Test public void defaultConfigurationAndPassiveStatusHaveNoNetworkOrImplicitOptIn()throws Exception {
        assertFalse(fixture.manager.config().configured());assertFalse(fixture.manager.config().enabled);assertFalse(fixture.manager.hasSession());assertEquals("",fixture.manager.selectedSource());assertFalse(fixture.manager.canResume("hosted:missing"));assertEquals(0,fixture.opened.size());
        assertFalse(new File(context.getFilesDir(),"user-host-config-v1.json").exists());
        fixture.configured();assertTrue(fixture.manager.config().enabled);assertFalse(fixture.manager.hasSession());assertEquals(0,fixture.opened.size());
        assertThrows(IllegalStateException.class,()->fixture.manager.start("","",false));assertEquals(0,fixture.opened.size());
    }
    @Test public void listingBindingAndSearchingAreSeparateExplicitActions()throws Exception {
        fixture.configured();fixture.manager.start("","",true);assertEquals(1,fixture.opened.size());
        assertThrows(IllegalStateException.class,()->fixture.manager.search("query",1));assertThrows(IllegalStateException.class,()->fixture.manager.bind(HostTestFixture.SOURCE,true));assertEquals(1,fixture.opened.size());
        fixture.manager.sources(0);int listed=fixture.opened.size();assertThrows(IllegalStateException.class,()->fixture.manager.bind(HostTestFixture.SOURCE,false));fixture.manager.bind(HostTestFixture.SOURCE,true);assertEquals(listed,fixture.opened.size());
        HostSourceManager.Book book=fixture.manager.search("synthetic",1).books.get(0);assertTrue(book.id.matches("hosted:[0-9a-f-]{36}:[0-9a-f]{64}"));assertEquals(HostTestFixture.SOURCE,book.source);assertFalse(fixture.manager.canResume(book.id));
        assertEquals(HostTestFixture.SOURCE,fixture.opened.get(fixture.opened.size()-1).request.getJSONObject("variables").getJSONObject("input").getString("source"));
        assertThrows(IllegalStateException.class,()->fixture.manager.sources(0));
    }
    @Test public void sameReaderAndHistoryUseHostIdentityWithoutDesktopOrProviderTraffic()throws Exception {
        HostSourceManager.Book book=fixture.selected();HostReaderSource source=new HostReaderSource(fixture.manager);int opened=fixture.opened.size();assertEquals("host",source.kind());assertEquals(book.title,source.displayTitle(book.id));assertEquals(opened,fixture.opened.size());
        BridgeClient.ChapterItem chapter=source.chapters(book.id).get(0);BridgeClient.ChapterData data=source.chapter(book.id,chapter.id);assertEquals(2,data.pages.size());assertTrue(data.pages.get(0).url.startsWith("host-page:"));assertFalse(data.pages.get(0).url.contains("https://"));
        HttpURLConnection image=source.image(data.pages.get(0).url);try(InputStream in=image.getInputStream()){assertEquals(137,in.read());}finally{image.disconnect();}
        ReaderProgress progress=new ReaderProgress(context,source);progress.chapterMetadata(chapter.id,chapter.title,chapter.order);opened=fixture.opened.size();progress.save(book.id,chapter.id,1,true);assertEquals(opened,fixture.opened.size());
        ReadingHistoryStore.importLocalBookmarksOnce(context);assertEquals(1,ReadingHistoryStore.load(context).sorted().size());ReadingHistoryStore.Session row=ReadingHistoryStore.load(context).sorted().get(0);assertEquals("host",row.providerId);assertEquals("host",row.sourceKind);assertEquals(book.title,row.title);assertFalse(UnifiedCatalogStore.load(context).byId.containsKey(book.id));assertFalse(source.emitsRecommendationEvidence());
        assertEquals(1,new ReaderProgress(context,new HostReaderSource(fixture.manager)).position(book.id,chapter.id,0));
    }
    @Test public void endingSessionDisconnectsAndFencesOldPermitsEvenAfterNewGrant()throws Exception {
        HostSourceManager.Book book=fixture.selected();HostReaderSource source=new HostReaderSource(fixture.manager);HostSourceManager.Session old=fixture.manager.requireSession();BridgeClient.ChapterItem chapter=source.chapters(book.id).get(0);BridgeClient.ChapterData data=source.chapter(book.id,chapter.id);HttpURLConnection connection=source.image(data.pages.get(0).url);InputStream in=connection.getInputStream();int opened=fixture.opened.size();
        fixture.manager.end();assertFalse(fixture.manager.hasSession());assertThrows(RuntimeException.class,old::check);assertThrows(IOException.class,in::read);assertTrue(fixture.opened.get(opened-1).disconnects>0);assertThrows(Exception.class,()->source.image(data.pages.get(0).url));assertEquals(opened,fixture.opened.size());connection.disconnect();
        fixture.manager.start("","",true);assertNotSame(old,fixture.manager.requireSession());assertThrows(RuntimeException.class,old::check);assertFalse(fixture.manager.canResume(book.id));
    }
    @Test public void expiryRejectsBeforeAnyFurtherRequestAndCleansUpCallbacks()throws Exception {
        fixture.selected();HostSourceManager.Session grant=fixture.manager.requireSession();AtomicInteger cancelled=new AtomicInteger();grant.onCancel(cancelled::incrementAndGet);int count=fixture.opened.size();fixture.clock.addAndGet(HostSourceManager.TTL);assertFalse(fixture.manager.hasSession());assertThrows(Exception.class,()->fixture.manager.search("query",1));assertEquals(count,fixture.opened.size());shadowOf(Looper.getMainLooper()).idle();assertEquals(1,cancelled.get());
    }
    @Test public void freshMetadataMustStillBelongToExplicitlySelectedSource()throws Exception {
        HostSourceManager.Book book=fixture.selected();HostReaderSource source=new HostReaderSource(fixture.manager);fixture.source="1";Exception failure=assertThrows(Exception.class,()->source.chapters(book.id));assertEquals("SOURCE_HOST_STALE",failure.getMessage());
    }
    @Test public void authenticationIsEphemeralAndNeverEntersConfigOrReaderLocators()throws Exception {
        fixture.manager.configure(0,"Synthetic Host","https://fixture.invalid/","basic",false);fixture.manager.enabled(1,true,true);fixture.manager.start("private-user","private-password",true);
        String config=new String(Files.readAllBytes(new File(context.getFilesDir(),"user-host-config-v1.json").toPath()),java.nio.charset.StandardCharsets.UTF_8);assertFalse(config.contains("private-user"));assertFalse(config.contains("private-password"));assertFalse(config.contains("Authorization"));
        String header=fixture.opened.get(0).getRequestProperty("Authorization");assertTrue(header.startsWith("Basic "));HostSourceManager.Session old=fixture.manager.requireSession();fixture.manager.end();assertThrows(RuntimeException.class,old::check);assertFalse(fixture.manager.hasSession());assertEquals(0,UnifiedCatalogStore.load(context).byId.size());
    }
    @Test public void corruptConfigurationRemainsUntouchedAndFailsClosed()throws Exception {
        File file=new File(context.getFilesDir(),"user-host-config-v1.json");byte[] bytes="{broken private".getBytes(java.nio.charset.StandardCharsets.UTF_8);Files.write(file.toPath(),bytes);HostTestFixture broken=new HostTestFixture(context);assertEquals("SOURCE_HOST_STORAGE",broken.manager.storageError());assertThrows(Exception.class,()->broken.manager.configure(0,"label","https://fixture.invalid","none",false));assertThrows(Exception.class,()->broken.manager.start("","",true));assertEquals(0,broken.opened.size());assertArrayEquals(bytes,Files.readAllBytes(file.toPath()));
    }
    @Test public void failedStartupErrorDoesNotLeaveAnUnreadySessionBlockingTheNextGrant()throws Exception {
        fixture.configured();fixture.failWithOom=true;assertThrows(OutOfMemoryError.class,()->fixture.manager.start("","",true));assertFalse(fixture.manager.hasSession());assertTrue(fixture.opened.get(0).disconnects>0);
        fixture.failWithOom=false;fixture.manager.start("","",true);assertTrue(fixture.manager.hasSession());assertEquals(2,fixture.opened.size());
    }
}
