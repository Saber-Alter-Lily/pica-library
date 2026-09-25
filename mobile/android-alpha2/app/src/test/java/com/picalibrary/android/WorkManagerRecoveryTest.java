package com.picalibrary.android;

import static org.junit.Assert.*;

import android.content.Context;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.work.Configuration;
import androidx.work.Data;
import androidx.work.ExistingWorkPolicy;
import androidx.work.OneTimeWorkRequest;
import androidx.work.WorkInfo;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import androidx.work.testing.WorkManagerTestInitHelper;

import java.lang.reflect.Field;
import java.util.*;
import java.util.concurrent.TimeUnit;

import org.junit.After;
import org.junit.AfterClass;
import org.junit.Before;
import org.junit.BeforeClass;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.android.controller.ActivityController;
import org.robolectric.annotation.Config;
import org.robolectric.annotation.LooperMode;

/**
 * WorkManager-backed recovery integration for Task Center.
 *
 * This intentionally verifies WorkManager database/WorkInfo + app registry reconstruction.
 * It does not claim to simulate an OS force-stop; device-level kill/relaunch remains separate.
 */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 35)
@LooperMode(LooperMode.Mode.PAUSED)
public class WorkManagerRecoveryTest {
    private static Context app;
    private static WorkManager manager;

    public static final class RecoveryWorker extends Worker {
        public RecoveryWorker(@NonNull Context context,@NonNull WorkerParameters params){
            super(context,params);
        }
        @NonNull @Override public Result doWork(){
            return Result.success(new Data.Builder().putString("phase","unexpected-run").build());
        }
    }

    @BeforeClass public static void initializeWorkManager() {
        app = RuntimeEnvironment.getApplication();
        Configuration configuration = new Configuration.Builder()
            .setMinimumLoggingLevel(Log.ERROR)
            .build();
        WorkManagerTestInitHelper.initializeTestWorkManager(app, configuration);
        manager = WorkManager.getInstance(app);
    }

    @AfterClass public static void closeWorkManager() throws Exception {
        if(manager!=null)manager.cancelAllWork().getResult().get(5,TimeUnit.SECONDS);
        WorkManagerTestInitHelper.closeWorkDatabase();
    }

    @Before public void resetDurableState() throws Exception {
        manager.cancelAllWork().getResult().get(5,TimeUnit.SECONDS);
        app.getSharedPreferences("background-task-registry-v1",Context.MODE_PRIVATE)
            .edit().clear().commit();
        app.getSharedPreferences("background-task-pauses-v1",Context.MODE_PRIVATE)
            .edit().clear().commit();
    }

    @After public void cleanupWork() throws Exception {
        manager.cancelAllWork().getResult().get(5,TimeUnit.SECONDS);
    }

    @Test public void replaceHistoryReconstructsOnlyPersistedCurrentDownload() throws Exception {
        String comic = "replace-" + UUID.randomUUID();
        String episode = "episode-1";
        String unique = PicaDownloadJobs.name(comic,episode);

        OneTimeWorkRequest first = delayedDownload("pica",comic,episode);
        manager.enqueueUniqueWork(unique,ExistingWorkPolicy.REPLACE,first)
            .getResult().get(5,TimeUnit.SECONDS);
        ActivityController<TaskCenterActivity> controller = taskCenter();
        TaskCenterActivity activity = controller.get();
        try{
            MobileTaskRegistryStore.registerDownload(activity,"pica",comic,episode,first.getId());

            OneTimeWorkRequest second = delayedDownload("pica",comic,episode);
            manager.enqueueUniqueWork(unique,ExistingWorkPolicy.REPLACE,second)
                .getResult().get(5,TimeUnit.SECONDS);
            MobileTaskRegistryStore.registerDownload(activity,"pica",comic,episode,second.getId());

            List<WorkInfo> history = manager.getWorkInfosByTag("pica-download")
                .get(5,TimeUnit.SECONDS);
            List<?> views = reconstructDownloads(activity,history);

            assertEquals(1,views.size());
            assertEquals(second.getId(),viewInfo(views.get(0)).getId());
            assertEquals(second.getId().toString(),onlyRegisteredDownload(activity).workId);
        }finally{
            controller.destroy();
        }
    }

    @Test public void activeWorkRepairsStaleRegistryUuid() throws Exception {
        String comic = "repair-" + UUID.randomUUID();
        String episode = "episode-2";
        String unique = PicaDownloadJobs.name(comic,episode);

        OneTimeWorkRequest current = delayedDownload("pica",comic,episode);
        manager.enqueueUniqueWork(unique,ExistingWorkPolicy.REPLACE,current)
            .getResult().get(5,TimeUnit.SECONDS);

        ActivityController<TaskCenterActivity> controller = taskCenter();
        TaskCenterActivity activity = controller.get();
        try{
            MobileTaskRegistryStore.registerDownload(
                activity,"pica",comic,episode,UUID.randomUUID()
            );

            List<?> views = reconstructDownloads(
                activity,
                manager.getWorkInfosByTag("pica-download").get(5,TimeUnit.SECONDS)
            );

            assertEquals(1,views.size());
            assertEquals(current.getId(),viewInfo(views.get(0)).getId());
            assertEquals(current.getId().toString(),onlyRegisteredDownload(activity).workId);
        }finally{
            controller.destroy();
        }
    }

    @Test public void pausedDownloadSurvivesWhenHistoricalWorkInfoIsUnavailable() throws Exception {
        String comic = "paused-" + UUID.randomUUID();
        String episode = "episode-3";
        UUID prior = UUID.randomUUID();

        ActivityController<TaskCenterActivity> controller = taskCenter();
        TaskCenterActivity activity = controller.get();
        try{
            MobileTaskRegistryStore.registerDownload(activity,"pica",comic,episode,prior);
            MobileTaskPauseStore.setPaused(
                activity,"download",PicaDownloadJobs.name(comic,episode),true
            );

            List<?> views = reconstructDownloads(activity,Collections.emptyList());

            assertEquals(1,views.size());
            MobileTaskRegistryStore.DownloadRef ref = viewRef(views.get(0));
            assertEquals(comic,ref.comicId);
            assertEquals(episode,ref.episodeId);
            assertNull(viewInfo(views.get(0)));
            assertEquals(prior.toString(),onlyRegisteredDownload(activity).workId);
        }finally{
            controller.destroy();
        }
    }

    @Test public void nonPausedMissingDownloadDoesNotResurrect() throws Exception {
        String comic = "cancelled-" + UUID.randomUUID();
        String episode = "episode-4";
        ActivityController<TaskCenterActivity> controller = taskCenter();
        TaskCenterActivity activity = controller.get();
        try{
            MobileTaskRegistryStore.registerDownload(
                activity,"pica",comic,episode,UUID.randomUUID()
            );

            List<?> views = reconstructDownloads(activity,Collections.emptyList());

            assertTrue(views.isEmpty());
            assertTrue(MobileTaskRegistryStore.downloads(activity).isEmpty());
        }finally{
            controller.destroy();
        }
    }

    @Test public void singletonRecoveryUsesExactPersistedRequestAndRepairsStaleUuid() throws Exception {
        String unique = "g14-singleton-" + UUID.randomUUID();
        String scope = "g14-singleton";

        OneTimeWorkRequest first = delayedSingleton("g14-singleton-tag");
        manager.enqueueUniqueWork(unique,ExistingWorkPolicy.REPLACE,first)
            .getResult().get(5,TimeUnit.SECONDS);

        OneTimeWorkRequest second = delayedSingleton("g14-singleton-tag");
        manager.enqueueUniqueWork(unique,ExistingWorkPolicy.REPLACE,second)
            .getResult().get(5,TimeUnit.SECONDS);
        ActivityController<TaskCenterActivity> controller = taskCenter();
        TaskCenterActivity activity = controller.get();
        try{
            MobileTaskRegistryStore.setWorkId(activity,scope,unique,second.getId());

            List<WorkInfo> history = manager.getWorkInfosForUniqueWork(unique)
                .get(5,TimeUnit.SECONDS);
            WorkInfo selected = currentWork(activity,history,scope,unique);
            assertNotNull(selected);
            assertEquals(second.getId(),selected.getId());

            MobileTaskRegistryStore.setWorkId(activity,scope,unique,UUID.randomUUID());
            WorkInfo repaired = currentWork(activity,history,scope,unique);
            assertNotNull(repaired);
            assertEquals(second.getId(),repaired.getId());
            assertEquals(
                second.getId().toString(),
                MobileTaskRegistryStore.workId(activity,scope,unique)
            );
        }finally{
            controller.destroy();
        }
    }

    private OneTimeWorkRequest delayedDownload(
        String provider,String comic,String episode
    ){
        OneTimeWorkRequest.Builder builder = new OneTimeWorkRequest.Builder(RecoveryWorker.class)
            .setInitialDelay(1,TimeUnit.DAYS)
            .addTag("eh".equals(provider)?"eh-download":"pica-download")
            .addTag("comic:"+comic);
        if(!"eh".equals(provider))
            builder.addTag(episode.isEmpty()?"episode:ALL":"episode:"+episode);
        return builder.build();
    }

    private OneTimeWorkRequest delayedSingleton(String tag){
        return new OneTimeWorkRequest.Builder(RecoveryWorker.class)
            .setInitialDelay(1,TimeUnit.DAYS)
            .addTag(tag)
            .build();
    }

    private ActivityController<TaskCenterActivity> taskCenter(){
        return Robolectric.buildActivity(TaskCenterActivity.class).create();
    }

    private List<?> reconstructDownloads(
        TaskCenterActivity activity,List<WorkInfo> infos
    ){
        return TaskCenterActivity.reconstructDownloads(activity,infos);
    }

    private WorkInfo currentWork(
        TaskCenterActivity activity,
        List<WorkInfo> values,String scope,String id
    ){
        return TaskCenterActivity.currentWork(activity,values,scope,id);
    }

    private MobileTaskRegistryStore.DownloadRef viewRef(Object view) throws Exception {
        Field field = view.getClass().getDeclaredField("ref");
        field.setAccessible(true);
        return (MobileTaskRegistryStore.DownloadRef)field.get(view);
    }

    private WorkInfo viewInfo(Object view) throws Exception {
        Field field = view.getClass().getDeclaredField("info");
        field.setAccessible(true);
        return (WorkInfo)field.get(view);
    }

    private MobileTaskRegistryStore.DownloadRef onlyRegisteredDownload(Context context){
        List<MobileTaskRegistryStore.DownloadRef> refs =
            MobileTaskRegistryStore.downloads(context);
        assertEquals(1,refs.size());
        return refs.get(0);
    }
}
