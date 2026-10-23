package com.picalibrary.android;

import android.content.Context;
import android.app.Application;
import androidx.work.*;
import androidx.work.testing.WorkManagerTestInitHelper;
import com.picalibrary.android.sources.SourceAccessPolicy;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.*;
import java.util.concurrent.TimeUnit;
import org.junit.*;
import org.junit.runner.RunWith;
import org.robolectric.*;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;

/** Synthetic app sandbox, deliberately without any real provider sessions or data. */
@RunWith(RobolectricTestRunner.class)
@Config(sdk={28,35},application=Application.class)
public class SourceAccessTest {
    private Context app;
    private File policyFile;
    @Before public void setUp(){
        // Android 12+ AtomicFile replaces .new via POSIX rename. The host Windows
        // File.renameTo cannot replace an existing file in Robolectric's framework.
        // Keep the real implementation: SDK28 runs locally, both SDKs run on Linux CI.
        Assume.assumeFalse(android.os.Build.VERSION.SDK_INT>=31&&System.getProperty("os.name","").startsWith("Windows"));
        app=RuntimeEnvironment.getApplication();SourceAccess.resetForTests();policyFile=new File(app.getFilesDir(),"source-access-v1.json");
    }
    private void enabled(String... ids) throws Exception {SourceAccess a=SourceAccess.get(app);a.save(a.snapshot().revision,Arrays.asList(ids));}
    private void workManager(){WorkManagerTestInitHelper.initializeTestWorkManager(app,new Configuration.Builder().setMinimumLoggingLevel(android.util.Log.ERROR).build());}
    private void awaitCancelled(WorkManager work,UUID id) throws Exception {
        long deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(5);
        while(System.nanoTime()<deadline){if(work.getWorkInfoById(id).get(1,TimeUnit.SECONDS).getState()==WorkInfo.State.CANCELLED)return;Thread.sleep(10);}
        fail("Source disable did not cancel its queued work");
    }
    @Test public void newInstallStaysOfflineEvenAfterDisclaimerAcceptanceAndProcessRestart() throws Exception {
        assertEquals(Collections.emptySet(),SourceAccess.get(app).snapshot().enabled);
        app.getSharedPreferences("pica-disclaimer-v1",0).edit().putString("accepted_version","1").commit();
        SourceAccess.resetForTests();assertTrue(SourceAccess.get(app).snapshot().enabled.isEmpty());
        assertFalse(PicaClient.available(app));assertFalse(EhClient.accountAvailable(app));
        assertFalse(JmClientManager.get(app).status().optBoolean("enabled"));
    }
    @Test public void existingInstallationImportsLegacyAvailabilityExactlyOnceWithoutDecryptingSecrets() throws Exception {
        app.getSharedPreferences("eh-account-v1",0).edit().putString("memberId","invalid-encrypted-fixture").commit();
        assertEquals(new LinkedHashSet<>(SourceAccessPolicy.IDS),SourceAccess.get(app).snapshot().enabled);
        SourceAccess.resetForTests();assertEquals(0,SourceAccess.get(app).snapshot().revision);
        assertEquals("invalid-encrypted-fixture",app.getSharedPreferences("eh-account-v1",0).getString("memberId",""));
    }
    @Test public void choiceSurvivesRestartAndDisabledSourcesCannotReachAnyDirectTransport() throws Exception {
        enabled("eh");SourceAccess.resetForTests();assertEquals(Collections.singleton("eh"),SourceAccess.get(app).snapshot().enabled);assertEquals(1,SourceAccess.get(app).snapshot().revision);
        assertThrows(SourceAccessPolicy.Disabled.class,()->new PicaClient(app).media("https://fixture.invalid/image.jpg"));
        assertThrows(SourceAccessPolicy.Disabled.class,()->JmClientManager.get(app).search("fixture",1));
        assertThrows(SourceAccessPolicy.Disabled.class,()->SourceMedia.thumbnail("https://fixture.invalid/jm.jpg",SourceAccess.bind(app,"jm")));
    }
    @Test public void damagedFileFailsClosedIsRetainedAndCannotSilentlyBeOverwritten() throws Exception {
        byte[] damaged="{incomplete".getBytes(StandardCharsets.UTF_8);Files.write(policyFile.toPath(),damaged);
        SourceAccess a=SourceAccess.get(app);assertFalse(a.loadError().isEmpty());assertTrue(a.snapshot().enabled.isEmpty());
        assertThrows(IOException.class,()->a.save(0,SourceAccessPolicy.IDS));assertArrayEquals(damaged,Files.readAllBytes(policyFile.toPath()));
    }
    @Test public void strictSchemaRejectsCoercionUnknownFieldsAndOversizedFiles() throws Exception {
        for(String value:Arrays.asList("{\"schemaVersion\":\"1\",\"revision\":0,\"enabled\":[]}","{\"schemaVersion\":1,\"revision\":0.5,\"enabled\":[]}","{\"schemaVersion\":1,\"revision\":0,\"enabled\":[\"exh\"]}","{\"schemaVersion\":1,\"revision\":0,\"enabled\":[],\"secret\":\"fixture\"}"))assertThrows(Exception.class,()->SourceAccess.parse(value.getBytes(StandardCharsets.UTF_8)));
        Files.write(policyFile.toPath(),new byte[5000]);assertFalse(SourceAccess.get(app).loadError().isEmpty());assertEquals(5000,policyFile.length());
    }
    @Test public void lateMetadataAndFavoriteSnapshotsCannotCommitAfterDisableReenable() throws Exception {
        workManager();enabled("pica","eh");
        PicaClient.Comic pica=new PicaClient.Comic("fixture-id","Fixture","Writer","","","",Collections.emptyList(),Collections.emptyList(),false,false,0,0,0,0);pica.sourceAccess=SourceAccess.bind(app,"pica");
        EhFavoriteSync sync=new EhFavoriteSync(Collections.emptyList(),Collections.emptyList(),Collections.emptyList(),new int[10]);sync.sourceAccess=SourceAccess.bind(app,"eh");
        enabled();enabled("pica","eh");
        assertThrows(SourceAccessPolicy.Disabled.class,()->UnifiedPicaCatalogSync.merge(app,pica));
        assertThrows(SourceAccessPolicy.Disabled.class,()->EhFavoriteStore.replaceRemote(app,sync));
        assertFalse(UnifiedCatalogStore.load(app).byId.containsKey("fixture-id"));
        WorkManagerTestInitHelper.closeWorkDatabase();
    }
    @Test public void sourceDisableRetainsDataCredentialsAndPausesOnlyItsWork() throws Exception {
        workManager();enabled("pica","eh","jm");
        File data=new File(app.getFilesDir(),"owned-download.fixture");Files.write(data.toPath(),new byte[]{3,1,4});
        app.getSharedPreferences("pica-account-v1",0).edit().putString("account","opaque-private-fixture").commit();
        WorkManager wm=WorkManager.getInstance(app);
        OneTimeWorkRequest pica=new OneTimeWorkRequest.Builder(WorkManagerRecoveryTest.RecoveryWorker.class).setInitialDelay(1,TimeUnit.DAYS).addTag("pica-download").build();
        OneTimeWorkRequest lan=new OneTimeWorkRequest.Builder(WorkManagerRecoveryTest.RecoveryWorker.class).setInitialDelay(1,TimeUnit.DAYS).addTag("lan-sync").build();
        wm.enqueue(Arrays.asList(pica,lan)).getResult().get(5,TimeUnit.SECONDS);MobileTaskRegistryStore.registerDownload(app,"pica","fixture","ep",pica.getId());
        enabled("eh","jm");
        awaitCancelled(wm,pica.getId());
        assertEquals(WorkInfo.State.CANCELLED,wm.getWorkInfoById(pica.getId()).get().getState());
        assertEquals(WorkInfo.State.ENQUEUED,wm.getWorkInfoById(lan.getId()).get().getState());
        assertTrue(PicaDownloadJobs.paused(app,"fixture","ep"));assertEquals(1,MobileTaskRegistryStore.downloads(app).size());
        assertEquals("opaque-private-fixture",app.getSharedPreferences("pica-account-v1",0).getString("account",""));assertArrayEquals(new byte[]{3,1,4},Files.readAllBytes(data.toPath()));
        assertThrows(SourceAccessPolicy.Disabled.class,()->PicaDownloadJobs.resume(app,"fixture","ep"));assertTrue(PicaDownloadJobs.paused(app,"fixture","ep"));
        wm.cancelAllWork().getResult().get(5,TimeUnit.SECONDS);WorkManagerTestInitHelper.closeWorkDatabase();
    }
    @Test public void malformedLegacyTaskCannotPreventSourceDisableOrSchedulerCancellation() throws Exception {
        workManager();enabled("jm");WorkManager wm=WorkManager.getInstance(app);
        OneTimeWorkRequest job=new OneTimeWorkRequest.Builder(WorkManagerRecoveryTest.RecoveryWorker.class).setInitialDelay(1,TimeUnit.DAYS).addTag("jm-download").build();
        wm.enqueue(job).getResult().get(5,TimeUnit.SECONDS);
        MobileTaskRegistryStore.registerDownload(app,"jm","legacy-invalid-id","",job.getId());
        enabled();assertFalse(SourceAccess.enabled(app,"jm"));
        awaitCancelled(wm,job.getId());
        assertEquals(WorkInfo.State.CANCELLED,wm.getWorkInfoById(job.getId()).get().getState());
        assertEquals("legacy-invalid-id",MobileTaskRegistryStore.downloads(app).get(0).comicId);
        SourceAccess.resetForTests();assertFalse(SourceAccess.enabled(app,"jm"));WorkManagerTestInitHelper.closeWorkDatabase();
    }
    @Test public void sourcePolicyCannotDisableOrdinaryLocalLanOrWebdavAccess(){
        for(String path:Arrays.asList("/mobile/v1/library?scope=downloaded","/mobile/v1/pair","/mobile/v1/accounts/status","/mobile/v1/reader/recent","/mobile/v1/recommendations","/mobile/v1/shelves"))assertEquals("",SourceAccess.relaySource(path));
        assertEquals("pica",SourceAccess.relaySource("/mobile/v1/provider/pica/search"));assertEquals("eh",SourceAccess.relaySource("/mobile/v1/provider/eh/page-image?locator=fixture"));
        UnifiedCatalogStore.Entry local=new UnifiedCatalogStore.Entry("fixture","Fixture","Writer");local.phoneDownloaded=true;local.picaAvailable=true;
        assertEquals(Collections.singletonList(UnifiedSourceResolver.Source.PHONE_DOWNLOAD),UnifiedSourceResolver.candidates(app,local));
    }
}
