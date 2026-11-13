package com.picalibrary.android;

import static org.junit.Assert.*;
import static org.robolectric.Shadows.shadowOf;
import android.content.Intent;
import android.os.Looper;
import android.view.View;
import android.widget.*;
import java.util.*;
import java.util.concurrent.*;
import org.junit.*;
import org.junit.runner.RunWith;
import org.robolectric.*;
import org.robolectric.android.controller.ActivityController;
import org.robolectric.annotation.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk=28,application=android.app.Application.class)
@LooperMode(LooperMode.Mode.PAUSED)
public class HostSourceActivityTest {
    private static HostTestFixture fixture;
    public static class Screen extends HostSourceActivity {
        @Override protected HostSourceManager createManager(){return fixture.manager;}
        @Override protected ExecutorService createWorker(){return new Inline();}
    }
    private static final class Inline extends AbstractExecutorService {
        private boolean closed;public void shutdown(){closed=true;}public List<Runnable> shutdownNow(){closed=true;return Collections.emptyList();}public boolean isShutdown(){return closed;}public boolean isTerminated(){return closed;}public boolean awaitTermination(long timeout,TimeUnit unit){return closed;}public void execute(Runnable command){if(closed)throw new RejectedExecutionException();command.run();}
    }
    @Before public void setup()throws Exception {fixture=new HostTestFixture(RuntimeEnvironment.getApplication());}
    @After public void end(){fixture.manager.end();HostSourceManager.resetForTests();}
    @Test public void savedBookListSurvivesSessionEndAndReadWithoutGrantOnlyExplainsAuthorization()throws Exception {
        HostSourceManager.Book book=fixture.selected();fixture.manager.saveBook(book.id,true);fixture.manager.end();int before=fixture.opened.size();
        try(ActivityController<Screen> controller=Robolectric.buildActivity(Screen.class)){Screen screen=controller.setup().get();assertNotNull(view(screen,"host.book.read."+book.id));view(screen,"host.book.read."+book.id).performClick();assertEquals(before,fixture.opened.size());assertEquals(screen.getString(R.string.host_book_authorize),((TextView)view(screen,"host.status")).getText().toString());assertEquals(book.title,((EditText)view(screen,"host.query")).getText().toString());assertNull(shadowOf(screen).getNextStartedActivity());}
    }
    @Test public void explicitPinFromSearchPersistsOnlyReferenceAndDoesNotOpenReaderOrDownload()throws Exception {
        fixture.configured();try(ActivityController<Screen> controller=Robolectric.buildActivity(Screen.class)){Screen screen=connect(controller);view(screen,"host.bind").performClick();((EditText)view(screen,"host.query")).setText("synthetic");view(screen,"host.search").performClick();HostSourceManager.Book book=fixture.manager.search("synthetic",1).books.get(0);view(screen,"host.pin."+book.id).performClick();assertEquals(book.id,fixture.manager.savedBooks().get(0).comicId);assertNotNull(view(screen,"host.book.read."+book.id));assertEquals(0,LocalComicStore.list(screen).size());assertNull(shadowOf(screen).getNextStartedActivity());}
    }
    @Test public void localSavedPaginationNeverConnectsAndDoesNotHideRecordsAfterFirstPage()throws Exception {
        HostSavedBooks store=new HostSavedBooks(RuntimeEnvironment.getApplication());for(int i=1;i<=13;i++)store.put(HostSavedBooksTest.book(i));
        try(ActivityController<Screen> controller=Robolectric.buildActivity(Screen.class)){Screen screen=controller.setup().get();assertEquals(36,((LinearLayout)view(screen,"host.books")).getChildCount());assertTrue(view(screen,"host.books.next").isEnabled());view(screen,"host.books.next").performClick();assertEquals(3,((LinearLayout)view(screen,"host.books")).getChildCount());assertFalse(view(screen,"host.books.next").isEnabled());assertTrue(view(screen,"host.books.previous").isEnabled());view(screen,"host.books.previous").performClick();assertEquals(36,((LinearLayout)view(screen,"host.books")).getChildCount());assertEquals(0,fixture.opened.size());}
    }
    @Test public void corruptSavedFileShowsRetainedErrorNotAnEmptyListAndDoesNotConnect()throws Exception {
        java.io.File file=new java.io.File(RuntimeEnvironment.getApplication().getFilesDir(),"user-host-saved-books-v1.json");byte[] before="{broken owned fixture".getBytes(java.nio.charset.StandardCharsets.UTF_8);java.nio.file.Files.write(file.toPath(),before);
        try(ActivityController<Screen> controller=Robolectric.buildActivity(Screen.class)){Screen screen=controller.setup().get();assertEquals(screen.getString(R.string.host_books_storage_error),((TextView)view(screen,"host.books.status")).getText().toString());assertEquals(0,fixture.opened.size());assertArrayEquals(before,java.nio.file.Files.readAllBytes(file.toPath()));}
    }
    @Test public void savedReadAfterExplicitRegrantUsesTheOriginalReaderWithoutSearch()throws Exception {
        HostSourceManager.Book book=fixture.selected();fixture.manager.saveBook(book.id,true);fixture.manager.end();fixture.manager.start("","",true);fixture.manager.sources(0);fixture.manager.bind(HostTestFixture.SOURCE,true);int before=fixture.opened.size();
        try(ActivityController<Screen> controller=Robolectric.buildActivity(Screen.class)){Screen screen=controller.setup().get();assertEquals(before,fixture.opened.size());view(screen,"host.book.read."+book.id).performClick();Intent reader=shadowOf(screen).getNextStartedActivity();assertNotNull(reader);assertEquals(ReaderActivity.class.getName(),reader.getComponent().getClassName());assertEquals("host",reader.getStringExtra("source"));assertEquals(book.id,reader.getStringExtra("comicId"));for(int i=before;i<fixture.opened.size();i++)assertNotEquals("PicaHostSourceSearch",fixture.opened.get(i).request.optString("operationName"));}
    }
    @Test public void removingReferenceRequiresConfirmationAndDoesNotSendAHostRequest()throws Exception {
        HostSourceManager.Book book=fixture.selected();fixture.manager.saveBook(book.id,true);fixture.manager.end();int before=fixture.opened.size();
        try(ActivityController<Screen> controller=Robolectric.buildActivity(Screen.class)){
            Screen screen=controller.setup().get();view(screen,"host.book.remove."+book.id).performClick();
            assertTrue(org.robolectric.shadows.ShadowAlertDialog.getLatestAlertDialog().isShowing());
            assertEquals("Opening confirmation must retain the reference",1,fixture.manager.savedBooks().size());
            pressDialog(android.app.AlertDialog.BUTTON_NEGATIVE);
            assertEquals("Cancel must retain the reference",1,fixture.manager.savedBooks().size());
            view(screen,"host.book.remove."+book.id).performClick();pressDialog(android.app.AlertDialog.BUTTON_POSITIVE);
            assertEquals("Confirmed removal must complete",0,fixture.manager.savedBooks().size());
            assertEquals(screen.getString(R.string.host_book_removed),((TextView)view(screen,"host.status")).getText().toString());
            assertEquals("Local reference removal must not contact the host",before,fixture.opened.size());
        }
    }
    @Test public void fullSavedCollectionExplainsLimitWithoutEvictionOrAReaderLaunch()throws Exception {
        org.json.JSONArray rows=new org.json.JSONArray();for(int i=1;i<=500;i++)rows.put(HostSavedBooksTest.book(i).json());java.nio.file.Files.write(new java.io.File(RuntimeEnvironment.getApplication().getFilesDir(),"user-host-saved-books-v1.json").toPath(),new org.json.JSONObject().put("schemaVersion",1).put("books",rows).toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));
        fixture.configured();try(ActivityController<Screen> controller=Robolectric.buildActivity(Screen.class)){Screen screen=connect(controller);view(screen,"host.bind").performClick();((EditText)view(screen,"host.query")).setText("synthetic");view(screen,"host.search").performClick();HostSourceManager.Book book=fixture.manager.search("synthetic",1).books.get(0);view(screen,"host.pin."+book.id).performClick();assertEquals(screen.getString(R.string.host_books_full),((TextView)view(screen,"host.status")).getText().toString());assertEquals(500,fixture.manager.savedBooks().size());assertNull(shadowOf(screen).getNextStartedActivity());}
    }
    private <T extends View>T view(Screen screen,String tag){return screen.getWindow().getDecorView().findViewWithTag(tag);}
    private void pressDialog(int which){org.robolectric.shadows.ShadowAlertDialog.getLatestAlertDialog().getButton(which).performClick();shadowOf(Looper.getMainLooper()).idle();}
    private Screen connect(ActivityController<Screen> controller)throws Exception {Screen screen=controller.setup().get();((CheckBox)view(screen,"host.consent")).setChecked(true);view(screen,"host.start").performClick();shadowOf(Looper.getMainLooper()).idle();return screen;}
    @Test public void creatingAndResumingScreenNeverConnectsEvenWithEnabledConfig()throws Exception {
        fixture.configured();try(ActivityController<Screen> controller=Robolectric.buildActivity(Screen.class)){Screen screen=controller.setup().get();assertEquals(0,fixture.opened.size());assertTrue(view(screen,"host.start").isEnabled());assertFalse(view(screen,"host.search").isEnabled());view(screen,"host.start").performClick();assertEquals(0,fixture.opened.size());controller.pause().resume();assertEquals(0,fixture.opened.size());}
    }
    @Test public void listingDoesNotChooseSourceAndExplicitBindDoesNotSearch()throws Exception {
        fixture.configured();try(ActivityController<Screen> controller=Robolectric.buildActivity(Screen.class)){Screen screen=connect(controller);assertEquals(2,fixture.opened.size());assertEquals("",fixture.manager.selectedSource());assertFalse(view(screen,"host.search").isEnabled());view(screen,"host.bind").performClick();assertEquals(HostTestFixture.SOURCE,fixture.manager.selectedSource());assertTrue(view(screen,"host.search").isEnabled());assertEquals(2,fixture.opened.size());}
    }
    @Test public void ownSourceSearchOpensExistingReaderWithExplicitHostKind()throws Exception {
        fixture.configured();try(ActivityController<Screen> controller=Robolectric.buildActivity(Screen.class)){Screen screen=connect(controller);view(screen,"host.bind").performClick();((EditText)view(screen,"host.query")).setText("synthetic");view(screen,"host.search").performClick();HostSourceManager.Book book=fixture.manager.search("synthetic",1).books.get(0);view(screen,"host.read."+book.id).performClick();Intent reader=shadowOf(screen).getNextStartedActivity();assertNotNull(reader);assertEquals(ReaderActivity.class.getName(),reader.getComponent().getClassName());assertEquals("host",reader.getStringExtra("source"));assertEquals(book.id,reader.getStringExtra("comicId"));assertEquals(0,LocalComicStore.list(screen).size());}
    }
    @Test public void unsavedEndpointCannotReceiveOldConfiguredCredentials()throws Exception {
        fixture.configured();try(ActivityController<Screen> controller=Robolectric.buildActivity(Screen.class)){Screen screen=controller.setup().get();((EditText)view(screen,"host.endpoint")).setText("https://different.invalid/");assertFalse(view(screen,"host.start").isEnabled());assertFalse(view(screen,"host.enable").isEnabled());assertEquals(0,fixture.opened.size());}
    }
    @Test public void returningFromHistoryPrefillsOnlyAQueryWithoutNetworkOrSecrets()throws Exception {
        Intent intent=new Intent(RuntimeEnvironment.getApplication(),Screen.class).putExtra("hostQuery","Synthetic previous title");try(ActivityController<Screen> controller=Robolectric.buildActivity(Screen.class,intent)){Screen screen=controller.setup().get();assertEquals("Synthetic previous title",((EditText)view(screen,"host.query")).getText().toString());assertEquals("",((EditText)view(screen,"host.username")).getText().toString());assertEquals("",((EditText)view(screen,"host.password")).getText().toString());assertFalse(view(screen,"host.username").isSaveEnabled());assertFalse(view(screen,"host.password").isSaveEnabled());assertEquals(0,fixture.opened.size());}
    }
    @Test public void failedBackgroundStartupErrorReleasesBusyUiForExplicitRetry()throws Exception {
        fixture.configured();fixture.failWithOom=true;try(ActivityController<Screen> controller=Robolectric.buildActivity(Screen.class)){Screen screen=connect(controller);assertFalse(fixture.manager.hasSession());assertTrue(view(screen,"host.start").isEnabled());assertEquals(screen.getString(R.string.host_request_failed),((TextView)view(screen,"host.status")).getText().toString());
            fixture.failWithOom=false;view(screen,"host.start").performClick();shadowOf(Looper.getMainLooper()).idle();assertTrue(fixture.manager.hasSession());assertTrue(view(screen,"host.bind").isEnabled());}
    }
}
