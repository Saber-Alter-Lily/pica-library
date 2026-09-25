package com.picalibrary.android;

import static org.junit.Assert.*;

import android.content.Context;
import android.content.SharedPreferences;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.work.ExistingWorkPolicy;
import androidx.work.OneTimeWorkRequest;
import androidx.work.WorkInfo;
import androidx.work.WorkManager;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

import org.junit.Test;
import org.junit.runner.RunWith;

/**
 * Two-stage emulator recovery evidence.
 *
 * Stage A seeds the production WorkManager database plus the app's durable task registry.
 * The shell then force-stops the target package. Stage B is invoked by a fresh instrumentation
 * process and verifies the same persisted WorkManager/registry state through Task Center's
 * production reconstruction selectors.
 */
@RunWith(AndroidJUnit4.class)
public class WorkManagerProcessRecoveryInstrumentedTest {
    private static final String PROBE_PREFS="p2-g15-worker-recovery";
    private static final String PROBE_TAG="p2-g15-recovery-probe";
    private static final String ACTIVE_COMIC="__p2_g15_active__";
    private static final String PAUSED_COMIC="__p2_g15_paused__";
    private static final String COMPLETED_COMIC="__p2_g15_completed__";
    private static final String CANCELLED_COMIC="__p2_g15_cancelled__";

    private static final String K_PHASE="phase";
    private static final String K_ACTIVE="active";
    private static final String K_PAUSED="paused";
    private static final String K_COMPLETED="completed";
    private static final String K_CANCELLED="cancelled";
    private static final String K_SINGLETON="singleton";

    @Test public void a_seedRecoveryState() throws Exception {
        Context app=app();
        WorkManager manager=WorkManager.getInstance(app);

        manager.cancelAllWorkByTag(PROBE_TAG).getResult().get(10,TimeUnit.SECONDS);
        app.getSharedPreferences("background-task-registry-v1",Context.MODE_PRIVATE)
            .edit().clear().commit();
        app.getSharedPreferences("background-task-pauses-v1",Context.MODE_PRIVATE)
            .edit().clear().commit();
        prefs(app).edit().clear().commit();

        OneTimeWorkRequest active=delayedDownload(ACTIVE_COMIC);
        enqueueDownload(manager,active,ACTIVE_COMIC);
        MobileTaskRegistryStore.registerDownload(app,"pica",ACTIVE_COMIC,"",active.getId());
        assertUnfinished(waitForInfo(manager,active.getId()));

        OneTimeWorkRequest paused=delayedDownload(PAUSED_COMIC);
        enqueueDownload(manager,paused,PAUSED_COMIC);
        MobileTaskRegistryStore.registerDownload(app,"pica",PAUSED_COMIC,"",paused.getId());
        PicaDownloadJobs.pause(app,PAUSED_COMIC,"");
        assertEquals(WorkInfo.State.CANCELLED,waitForState(manager,paused.getId(),WorkInfo.State.CANCELLED).getState());
        assertTrue(PicaDownloadJobs.paused(app,PAUSED_COMIC,""));

        OneTimeWorkRequest completed=immediateDownload(COMPLETED_COMIC);
        enqueueDownload(manager,completed,COMPLETED_COMIC);
        MobileTaskRegistryStore.registerDownload(app,"pica",COMPLETED_COMIC,"",completed.getId());
        assertEquals(WorkInfo.State.SUCCEEDED,waitForState(manager,completed.getId(),WorkInfo.State.SUCCEEDED).getState());

        OneTimeWorkRequest cancelled=delayedDownload(CANCELLED_COMIC);
        enqueueDownload(manager,cancelled,CANCELLED_COMIC);
        MobileTaskRegistryStore.registerDownload(app,"pica",CANCELLED_COMIC,"",cancelled.getId());
        PicaDownloadJobs.cancel(app,CANCELLED_COMIC,"");
        assertEquals(WorkInfo.State.CANCELLED,waitForState(manager,cancelled.getId(),WorkInfo.State.CANCELLED).getState());
        assertFalse(PicaDownloadJobs.paused(app,CANCELLED_COMIC,""));
        assertFalse(hasRegisteredComic(app,CANCELLED_COMIC));

        OneTimeWorkRequest singleton=new OneTimeWorkRequest.Builder(SupporterEntitlementWorker.class)
            .setInitialDelay(1,TimeUnit.DAYS)
            .addTag(PROBE_TAG)
            .build();
        manager.enqueueUniqueWork(
            NativeRecommendationJobs.UNIQUE_NAME,ExistingWorkPolicy.REPLACE,singleton
        ).getResult().get(10,TimeUnit.SECONDS);
        MobileTaskRegistryStore.setWorkId(
            app,"recommendation",NativeRecommendationJobs.UNIQUE_NAME,singleton.getId()
        );
        assertUnfinished(waitForInfo(manager,singleton.getId()));

        boolean saved=prefs(app).edit()
            .putString(K_PHASE,"seeded")
            .putString(K_ACTIVE,active.getId().toString())
            .putString(K_PAUSED,paused.getId().toString())
            .putString(K_COMPLETED,completed.getId().toString())
            .putString(K_CANCELLED,cancelled.getId().toString())
            .putString(K_SINGLETON,singleton.getId().toString())
            .commit();
        assertTrue(saved);

        assertTrue(hasRegisteredComic(app,ACTIVE_COMIC));
        assertTrue(hasRegisteredComic(app,PAUSED_COMIC));
        assertTrue(hasRegisteredComic(app,COMPLETED_COMIC));
        assertEquals(singleton.getId().toString(),MobileTaskRegistryStore.workId(
            app,"recommendation",NativeRecommendationJobs.UNIQUE_NAME
        ));
    }

    @Test public void b_verifyRecoveryAfterForceStop() throws Exception {
        Context app=app();
        WorkManager manager=WorkManager.getInstance(app);
        SharedPreferences state=prefs(app);
        assertEquals("seeded",state.getString(K_PHASE,""));

        UUID activeId=id(state,K_ACTIVE);
        UUID pausedId=id(state,K_PAUSED);
        UUID completedId=id(state,K_COMPLETED);
        UUID cancelledId=id(state,K_CANCELLED);
        UUID singletonId=id(state,K_SINGLETON);

        assertUnfinished(waitForInfo(manager,activeId));
        assertEquals(WorkInfo.State.CANCELLED,waitForInfo(manager,pausedId).getState());
        assertEquals(WorkInfo.State.SUCCEEDED,waitForInfo(manager,completedId).getState());
        assertEquals(WorkInfo.State.CANCELLED,waitForInfo(manager,cancelledId).getState());
        assertUnfinished(waitForInfo(manager,singletonId));

        assertTrue(PicaDownloadJobs.paused(app,PAUSED_COMIC,""));
        assertFalse(PicaDownloadJobs.paused(app,CANCELLED_COMIC,""));

        // Deliberately omit the PAUSED WorkInfo to emulate WorkManager history pruning.
        List<WorkInfo> history=manager.getWorkInfosByTag("pica-download").get(10,TimeUnit.SECONDS);
        List<WorkInfo> visibleHistory=new ArrayList<>();
        for(WorkInfo info:history)if(!info.getId().equals(pausedId))visibleHistory.add(info);

        List<TaskCenterActivity.DownloadView> views=
            TaskCenterActivity.reconstructDownloads(app,visibleHistory);
        assertEquals(2,views.size());

        boolean sawActive=false,sawPaused=false;
        for(TaskCenterActivity.DownloadView view:views){
            if(ACTIVE_COMIC.equals(view.ref.comicId)){
                sawActive=true;
                assertNotNull(view.info);
                assertEquals(activeId,view.info.getId());
                assertEquals(activeId.toString(),view.ref.workId);
            }else if(PAUSED_COMIC.equals(view.ref.comicId)){
                sawPaused=true;
                assertNull(view.info);
                assertEquals(pausedId.toString(),view.ref.workId);
            }else{
                fail("Unexpected recovered download: "+view.ref.comicId);
            }
        }
        assertTrue(sawActive);
        assertTrue(sawPaused);

        Set<String> registered=new LinkedHashSet<>();
        for(MobileTaskRegistryStore.DownloadRef ref:MobileTaskRegistryStore.downloads(app))
            registered.add(ref.comicId);
        assertEquals(2,registered.size());
        assertTrue(registered.contains(ACTIVE_COMIC));
        assertTrue(registered.contains(PAUSED_COMIC));
        assertFalse(registered.contains(COMPLETED_COMIC));
        assertFalse(registered.contains(CANCELLED_COMIC));

        List<WorkInfo> singletonHistory=manager
            .getWorkInfosForUniqueWork(NativeRecommendationJobs.UNIQUE_NAME)
            .get(10,TimeUnit.SECONDS);
        WorkInfo current=TaskCenterActivity.currentWork(
            app,singletonHistory,"recommendation",NativeRecommendationJobs.UNIQUE_NAME
        );
        assertNotNull(current);
        assertEquals(singletonId,current.getId());
        assertEquals(singletonId.toString(),MobileTaskRegistryStore.workId(
            app,"recommendation",NativeRecommendationJobs.UNIQUE_NAME
        ));

        state.edit().putString(K_PHASE,"verified").commit();
        manager.cancelAllWorkByTag(PROBE_TAG).getResult().get(10,TimeUnit.SECONDS);
    }

    private static Context app(){
        return InstrumentationRegistry.getInstrumentation()
            .getTargetContext().getApplicationContext();
    }

    private static SharedPreferences prefs(Context app){
        return app.getSharedPreferences(PROBE_PREFS,Context.MODE_PRIVATE);
    }

    private static UUID id(SharedPreferences prefs,String key){
        String value=prefs.getString(key,"");
        assertNotNull(value);
        assertFalse(value.isEmpty());
        return UUID.fromString(value);
    }

    private static OneTimeWorkRequest delayedDownload(String comic){
        return downloadRequest(comic,true);
    }

    private static OneTimeWorkRequest immediateDownload(String comic){
        return downloadRequest(comic,false);
    }

    private static OneTimeWorkRequest downloadRequest(String comic,boolean delayed){
        OneTimeWorkRequest.Builder builder=
            new OneTimeWorkRequest.Builder(SupporterEntitlementWorker.class)
                .addTag(PROBE_TAG)
                .addTag("pica-download")
                .addTag("comic:"+comic)
                .addTag("episode:ALL");
        if(delayed)builder.setInitialDelay(1,TimeUnit.DAYS);
        return builder.build();
    }

    private static void enqueueDownload(
        WorkManager manager,OneTimeWorkRequest request,String comic
    ) throws Exception {
        manager.enqueueUniqueWork(
            PicaDownloadJobs.name(comic,""),ExistingWorkPolicy.REPLACE,request
        ).getResult().get(10,TimeUnit.SECONDS);
    }

    private static WorkInfo waitForInfo(WorkManager manager,UUID id) throws Exception {
        long deadline=android.os.SystemClock.elapsedRealtime()+15_000L;
        WorkInfo last=null;
        while(android.os.SystemClock.elapsedRealtime()<deadline){
            last=manager.getWorkInfoById(id).get(5,TimeUnit.SECONDS);
            if(last!=null)return last;
            Thread.sleep(100L);
        }
        fail("WorkInfo not available for "+id);
        return last;
    }

    private static WorkInfo waitForState(
        WorkManager manager,UUID id,WorkInfo.State expected
    ) throws Exception {
        long deadline=android.os.SystemClock.elapsedRealtime()+15_000L;
        WorkInfo last=null;
        while(android.os.SystemClock.elapsedRealtime()<deadline){
            last=manager.getWorkInfoById(id).get(5,TimeUnit.SECONDS);
            if(last!=null&&last.getState()==expected)return last;
            Thread.sleep(100L);
        }
        fail("Expected "+expected+" for "+id+" but was "+(last==null?"missing":last.getState()));
        return last;
    }

    private static void assertUnfinished(WorkInfo info){
        assertNotNull(info);
        assertFalse("Expected unfinished WorkInfo but was "+info.getState(),info.getState().isFinished());
    }

    private static boolean hasRegisteredComic(Context app,String comic){
        for(MobileTaskRegistryStore.DownloadRef ref:MobileTaskRegistryStore.downloads(app))
            if(comic.equals(ref.comicId))return true;
        return false;
    }
}
