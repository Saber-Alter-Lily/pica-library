package com.picalibrary.android;

import static org.junit.Assert.*;
import static org.robolectric.Shadows.shadowOf;

import android.app.AlertDialog;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.os.Looper;
import android.view.View;
import android.view.ViewGroup;
import android.view.inputmethod.EditorInfo;
import android.widget.*;
import java.io.IOException;
import java.util.*;
import java.util.concurrent.AbstractExecutorService;
import java.util.concurrent.TimeUnit;
import org.json.*;
import org.junit.*;
import org.junit.runner.RunWith;
import org.robolectric.*;
import org.robolectric.android.controller.ActivityController;
import org.robolectric.annotation.Config;
import org.robolectric.annotation.LooperMode;
import org.robolectric.shadows.ShadowAlertDialog;

/** Synthetic UI, scheduler and provider responses only; never accesses a real account. */
@RunWith(RobolectricTestRunner.class)
@Config(sdk=35,application=android.app.Application.class)
@LooperMode(LooperMode.Mode.PAUSED)
public class JmSourceActivityTest {
    private static FakeClient fixture;
    private static ManualExecutor executor;
    private ActivityController<TestActivity> controller;
    private TestActivity activity;
    public static class TestActivity extends JmSourceActivity {
        @Override protected Client createClient(){return fixture;}
        @Override protected java.util.concurrent.ExecutorService createWorker(){return executor;}
    }
    private static class ManualExecutor extends AbstractExecutorService {
        final ArrayDeque<Runnable> tasks=new ArrayDeque<>();boolean closed;
        public void execute(Runnable task){if(closed)throw new java.util.concurrent.RejectedExecutionException();tasks.add(task);}
        void runNext(){assertFalse("No synthetic job queued",tasks.isEmpty());tasks.remove().run();shadowOf(Looper.getMainLooper()).idle();}
        public void shutdown(){closed=true;}
        public List<Runnable> shutdownNow(){closed=true;List<Runnable> pending=new ArrayList<>(tasks);tasks.clear();return pending;}
        public boolean isShutdown(){return closed;}
        public boolean isTerminated(){return closed&&tasks.isEmpty();}
        public boolean awaitTermination(long time,TimeUnit unit){return isTerminated();}
    }
    private static class FakeClient implements JmSourceActivity.Client {
        boolean signedIn=true,scanFailure,importFailure,searchFailure,loginFailure,invalidSearch,statusFailure;
        int scans,imports,merges,cancels,logins,logouts,enrichments,details,searches;
        int resultCount=1;String account="Original",lastKeyword="",confirmedToken="";int lastPage;
        final List<String> requests=new ArrayList<>();Runnable duringScan,duringEnrich,duringDetails;
        public JSONObject status() throws Exception {if(statusFailure)throw new IOException("PRIVATE_STATUS_FIXTURE");return new JSONObject().put("configured",signedIn).put("username",signedIn?account:"");}
        public JSONObject login(String u,String p,boolean r) throws Exception {logins++;signedIn=false;if(loginFailure)throw new IOException("PRIVATE_PASSWORD_FIXTURE");account=u;signedIn=true;return status();}
        public void logout(){logouts++;signedIn=false;}
        public JSONObject previewFavorites(JmClientManager.FavoritesProgress progress) throws Exception {
            scans++;progress.onPage(1,2,1,2);if(duringScan!=null)duringScan.run();
            if(scanFailure)throw new IOException("PRIVATE_COOKIE_FIXTURE");
            return new JSONObject().put("token","PRIVATE_IMPORT_TOKEN").put("count",2);
        }
        public int confirm(String token) throws Exception {imports++;confirmedToken=token;if(importFailure)throw new IOException("PRIVATE_IMPORT_TOKEN");return 2;}
        public JSONObject enrichFavorites(JmClientManager.EnrichmentProgress progress) throws Exception {
            enrichments++;progress.onItem(1,2,1,0);if(duringEnrich!=null)duringEnrich.run();return new JSONObject().put("updated",1).put("failed",0).put("remaining",1);
        }
        public JSONObject search(String q,int p) throws Exception {
            searches++;lastKeyword=q;lastPage=p;requests.add(q+":"+p);if(searchFailure)throw new IOException("PRIVATE_QUERY_FIXTURE");
            JSONArray rows=new JSONArray();for(int i=0;i<resultCount;i++)rows.put(new JSONObject().put("comicId",invalidSearch?"pica:900":"jm:"+(900+p*10+i)).put("title","Fixture "+p).put("author","Fixture Author"));
            return new JSONObject().put("items",rows).put("page",p).put("pages",resultCount==0?0:3);
        }
        public JSONObject details(String id) throws Exception {details++;if(duringDetails!=null)duringDetails.run();return new JSONObject().put("comicId",id).put("title","Details fixture").put("author","Fixture Author");}
        public void merge(JSONArray rows){merges++;}
        public void cancel(){cancels++;}
    }
    @Before public void setup() throws Exception {SourceAccess.resetForTests();SourceAccess access=SourceAccess.get(RuntimeEnvironment.getApplication());access.policy.save(access.snapshot().revision,Collections.singleton("jm"),snapshot->{});fixture=new FakeClient();executor=new ManualExecutor();RuntimeEnvironment.setQualifiers("en");LocaleStore.set(RuntimeEnvironment.getApplication(),LocaleStore.EN);open(null);}
    private void open(Bundle saved){controller=Robolectric.buildActivity(TestActivity.class).create(saved).start().resume().visible();activity=controller.get();}
    private void ready(){executor.runNext();}
    private View view(String tag){View result=activity.getWindow().getDecorView().findViewWithTag(tag);assertNotNull("Missing view "+tag,result);return result;}
    private String text(String tag){return ((TextView)view(tag)).getText().toString();}
    private EditText query(){return (EditText)view("jm.query");}
    private void click(String tag){view(tag).performClick();shadowOf(Looper.getMainLooper()).idle();}
    private void pressDialog(int which){dialog().getButton(which).performClick();shadowOf(Looper.getMainLooper()).idle();}
    private void search(String keyword){query().setText(keyword);click("jm.search");executor.runNext();}
    private String message(int id,Object... args){return activity.getString(id,args);}
    private AlertDialog dialog(){return ShadowAlertDialog.getLatestAlertDialog();}
    private void destroy(){if(controller!=null){controller.pause().stop().destroy();controller=null;}}
    @After public void teardown(){AlertDialog dialog=ShadowAlertDialog.getLatestAlertDialog();if(dialog!=null&&dialog.isShowing())dialog.dismiss();destroy();fixture=null;executor=null;}

    @Test public void startupAndEveryActionShareOneBusyGate(){
        for(String tag:new String[]{"jm.login","jm.logout","jm.scan","jm.enrich","jm.search","jm.query"})assertFalse(view(tag).isEnabled());
        assertEquals(View.GONE,view("jm.cancel").getVisibility());ready();
        assertEquals(message(R.string.jm_source_status_signed_in,"Original"),text("jm.status"));
        click("jm.scan");click("jm.scan");click("jm.logout");click("jm.enrich");click("jm.search");
        assertEquals(1,executor.tasks.size());assertFalse(view("jm.logout").isEnabled());assertFalse(view("jm.enrich").isEnabled());
        executor.runNext();assertEquals(1,fixture.scans);assertEquals(0,fixture.logouts);assertEquals(0,fixture.enrichments);assertTrue(view("jm.logout").isEnabled());
    }
    @Test public void allThreeLocalesUseResourcesIncludingDialogsAndFormattedProgress(){
        destroy();
        String[] languages={LocaleStore.EN,LocaleStore.ZH_CN,LocaleStore.JA};
        String[] labels={"Sign in / switch JM account","登录 / 切换 JM 账号","JM にログイン / アカウント切替"};
        for(int i=0;i<languages.length;i++){
            LocaleStore.set(RuntimeEnvironment.getApplication(),languages[i]);
            // ActivityController uses host resource qualifiers; exercise actual resources for each host locale.
            RuntimeEnvironment.setQualifiers(i==1?"zh-rCN":languages[i]);
            assertEquals(labels[i],LocaleStore.wrap(RuntimeEnvironment.getApplication()).getString(R.string.jm_source_login));
            executor=new ManualExecutor();open(null);ready();
            assertEquals(labels[i],text("jm.login"));assertEquals(activity.getString(R.string.jm_source_query_hint),query().getHint().toString());
            fixture.duringScan=()->assertEquals(message(R.string.jm_source_scan_progress,1,2,1,2),text("jm.message"));
            click("jm.scan");executor.runNext();assertEquals(message(R.string.jm_source_confirm_count,2),text("jm.confirm"));
            click("jm.login");assertEquals(activity.getString(R.string.jm_source_remember),((CheckBox)dialog().getWindow().getDecorView().findViewWithTag("jm.remember")).getText().toString());dialog().dismiss();destroy();
        }
    }
    @Test public void loggedOutScanGivesGuidanceWithoutStartingNetwork(){fixture.signedIn=false;ready();click("jm.scan");assertEquals(0,executor.tasks.size());assertEquals(0,fixture.scans);assertEquals(message(R.string.jm_source_login_required),text("jm.message"));}
    @Test public void completeScanNeedsExplicitSingleConfirmation(){
        ready();click("jm.scan");executor.runNext();assertEquals(0,fixture.imports);assertEquals(View.VISIBLE,view("jm.confirm").getVisibility());
        click("jm.confirm");click("jm.confirm");executor.runNext();assertEquals(1,fixture.imports);assertEquals("PRIVATE_IMPORT_TOKEN",fixture.confirmedToken);assertEquals(View.GONE,view("jm.confirm").getVisibility());
        assertEquals(message(R.string.jm_source_import_complete,2),text("jm.message"));
    }
    @Test public void cancelCannotResurrectAnOtherwiseSuccessfulPreview(){
        ready();fixture.duringScan=()->{click("jm.cancel");click("jm.cancel");assertFalse(view("jm.cancel").isEnabled());assertEquals(message(R.string.jm_source_cancel_wait),text("jm.message"));};
        click("jm.scan");executor.runNext();assertEquals(1,fixture.cancels);assertEquals(View.GONE,view("jm.confirm").getVisibility());assertEquals(message(R.string.jm_source_scan_cancelled),text("jm.message"));assertEquals(0,fixture.imports);
    }
    @Test public void cancelBeforeWorkerStartsMakesNoProviderRequest(){ready();click("jm.scan");click("jm.cancel");executor.runNext();assertEquals(0,fixture.scans);assertEquals(message(R.string.jm_source_scan_cancelled),text("jm.message"));}
    @Test public void failedScanAndExpiredPreviewNeverExposeRawErrorsOrImportAgain(){
        ready();fixture.scanFailure=true;click("jm.scan");executor.runNext();assertEquals(message(R.string.jm_source_scan_failed),text("jm.message"));assertEquals(View.GONE,view("jm.confirm").getVisibility());
        fixture.scanFailure=false;click("jm.scan");executor.runNext();fixture.importFailure=true;click("jm.confirm");executor.runNext();
        assertEquals(message(R.string.jm_source_import_failed),text("jm.message"));assertFalse(text("jm.message").contains("PRIVATE_"));assertEquals(View.GONE,view("jm.confirm").getVisibility());click("jm.confirm");assertEquals(0,executor.tasks.size());assertEquals(1,fixture.imports);
    }
    @Test public void enrichmentHasDistinctProgressAndCancellationSemantics(){
        ready();fixture.duringEnrich=()->{assertEquals(message(R.string.jm_source_enrich_progress,1,2,1,0),text("jm.message"));click("jm.cancel");};
        click("jm.enrich");executor.runNext();assertEquals(message(R.string.jm_source_enrich_cancelled),text("jm.message"));assertEquals(0,fixture.imports);assertEquals(0,fixture.merges);
        fixture.duringEnrich=null;click("jm.enrich");executor.runNext();assertEquals(message(R.string.jm_source_enrich_complete,1,0,1),text("jm.message"));
    }
    @Test public void failedNewSearchRetainsOldResultsAndPagingUsesSubmittedQuery(){
        ready();search("original");assertEquals(message(R.string.jm_source_page,1,3,1),text("jm.page"));
        fixture.searchFailure=true;search("new input");assertEquals(message(R.string.jm_source_search_failed),text("jm.message"));assertEquals(message(R.string.jm_source_page,1,3,1),text("jm.page"));assertEquals(1,((ViewGroup)view("jm.results")).getChildCount());
        fixture.searchFailure=false;click("jm.next");executor.runNext();assertEquals("original",fixture.lastKeyword);assertEquals(2,fixture.lastPage);assertEquals("new input",query().getText().toString());
    }
    @Test public void searchSupportsImeAndEmptyBrowseButRejectsOverlongInput(){
        ready();query().setText(" ");query().onEditorAction(EditorInfo.IME_ACTION_SEARCH);executor.runNext();assertEquals("",fixture.lastKeyword);
        query().setText(new String(new char[161]).replace('\0','x'));click("jm.search");assertEquals(0,executor.tasks.size());assertNotNull(query().getError());
    }
    @Test public void foreignSourceResultIsRejectedBeforeCatalogMerge(){ready();fixture.invalidSearch=true;search("invalid");assertEquals(0,fixture.merges);assertEquals(message(R.string.jm_source_search_failed),text("jm.message"));assertEquals(0,((ViewGroup)view("jm.results")).getChildCount());}
    @Test public void emptySearchHasClearEmptyStateAndNoNextPage(){ready();fixture.resultCount=0;search("missing");assertEquals(message(R.string.jm_source_search_empty),text("jm.message"));assertEquals("",text("jm.page"));assertFalse(view("jm.next").isEnabled());}
    @Test public void rotationRetainsOnlySearchMetadataAndRequiresFreshFavoritesScan(){
        ready();search("saved");query().setText("unsent");click("jm.scan");executor.runNext();
        Bundle state=new Bundle();controller.saveInstanceState(state);assertFalse(state.toString().contains("PRIVATE_IMPORT_TOKEN"));assertFalse(state.containsKey("jm.password"));
        int searches=fixture.searches;destroy();executor=new ManualExecutor();open(state);ready();assertEquals(searches,fixture.searches);assertEquals("unsent",query().getText().toString());
        assertEquals(message(R.string.jm_source_page,1,3,1),text("jm.page"));assertEquals(View.GONE,view("jm.confirm").getVisibility());assertEquals(message(R.string.jm_source_scan_interrupted),text("jm.message"));
        click("jm.next");executor.runNext();assertEquals("saved",fixture.lastKeyword);assertEquals(2,fixture.lastPage);
    }
    @Test public void loginValidationNeverSavesPasswordOrStartsDuplicateWork(){
        ready();click("jm.login");AlertDialog dialog=dialog();View decor=dialog.getWindow().getDecorView();EditText username=decor.findViewWithTag("jm.username"),password=decor.findViewWithTag("jm.password");CheckBox remember=decor.findViewWithTag("jm.remember");
        assertFalse(remember.isChecked());assertFalse(password.isSaveEnabled());pressDialog(AlertDialog.BUTTON_POSITIVE);assertTrue(dialog.isShowing());assertNotNull(password.getError());assertEquals(0,executor.tasks.size());
        username.setText("New account");password.setText("PRIVATE_PASSWORD_FIXTURE");Bundle state=new Bundle();controller.saveInstanceState(state);assertFalse(state.toString().contains("PRIVATE_PASSWORD_FIXTURE"));
        pressDialog(AlertDialog.BUTTON_POSITIVE);assertEquals("",password.getText().toString());assertFalse(dialog.isShowing());executor.runNext();assertEquals(1,fixture.logins);assertEquals(message(R.string.jm_source_status_signed_in,"New account"),text("jm.status"));assertEquals(message(R.string.jm_source_login_ephemeral),text("jm.message"));
    }
    @Test public void failedAccountSwitchDoesNotKeepThePreviousSignedInLabel(){
        ready();fixture.loginFailure=true;click("jm.login");View decor=dialog().getWindow().getDecorView();((EditText)decor.findViewWithTag("jm.username")).setText("Other");((EditText)decor.findViewWithTag("jm.password")).setText("PRIVATE_PASSWORD_FIXTURE");pressDialog(AlertDialog.BUTTON_POSITIVE);executor.runNext();
        assertEquals(message(R.string.jm_source_status_signed_out),text("jm.status"));assertEquals(message(R.string.jm_source_login_failed),text("jm.message"));assertFalse(text("jm.message").contains("PRIVATE_"));
    }
    @Test public void logoutRequiresConfirmationAndDoesNotImportOrMerge(){ready();click("jm.logout");pressDialog(AlertDialog.BUTTON_NEGATIVE);assertEquals(0,fixture.logouts);click("jm.logout");pressDialog(AlertDialog.BUTTON_POSITIVE);executor.runNext();assertEquals(1,fixture.logouts);assertEquals(0,fixture.merges);assertEquals(0,fixture.imports);assertEquals(message(R.string.jm_source_logout_complete),text("jm.message"));}
    @Test public void statusFailureIsUnknownNotStaleAndStillAllowsRecovery(){fixture.statusFailure=true;ready();assertEquals(message(R.string.jm_source_status_unknown),text("jm.status"));assertEquals(message(R.string.jm_source_status_failed),text("jm.message"));assertTrue(view("jm.login").isEnabled());assertTrue(view("jm.logout").isEnabled());}
    @Test public void lateDetailsCompletionDoesNotNavigateAfterDestruction(){
        ready();search("details");fixture.duringDetails=()->destroy();click("jm.detail:jm:910");executor.runNext();assertEquals(1,fixture.details);assertNull(shadowOf(activity).getNextStartedActivity());
    }
    @Test public void detailsUseUnifiedReaderEntryWithoutPicaLoginFallback(){ready();search("details");click("jm.detail:jm:910");executor.runNext();Intent intent=shadowOf(activity).getNextStartedActivity();assertNotNull(intent);assertEquals(UnifiedComicDetailActivity.class.getName(),intent.getComponent().getClassName());assertEquals("jm:910",intent.getStringExtra("comicId"));}
}
