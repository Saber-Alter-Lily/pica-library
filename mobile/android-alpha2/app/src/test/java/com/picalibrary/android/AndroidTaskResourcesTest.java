package com.picalibrary.android;

import static org.junit.Assert.*;

import android.content.Context;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.work.Configuration;
import androidx.work.OneTimeWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import androidx.work.testing.WorkManagerTestInitHelper;

import java.util.concurrent.TimeUnit;

import org.junit.AfterClass;
import org.junit.BeforeClass;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;
import org.robolectric.annotation.LooperMode;

@RunWith(RobolectricTestRunner.class)
@Config(sdk=35)
@LooperMode(LooperMode.Mode.PAUSED)
public final class AndroidTaskResourcesTest {
    private static Context app;
    private static WorkManager manager;

    public static final class ProbeWorker extends Worker {
        public ProbeWorker(@NonNull Context context,@NonNull WorkerParameters params){
            super(context,params);
        }
        @NonNull @Override public Result doWork(){return Result.success();}
    }

    @BeforeClass public static void initialize() {
        app=RuntimeEnvironment.getApplication();
        Configuration configuration=new Configuration.Builder()
            .setMinimumLoggingLevel(Log.ERROR).build();
        WorkManagerTestInitHelper.initializeTestWorkManager(app,configuration);
        manager=WorkManager.getInstance(app);
    }

    @AfterClass public static void close() throws Exception {
        if(manager!=null)manager.cancelAllWork().getResult().get(5,TimeUnit.SECONDS);
        WorkManagerTestInitHelper.closeWorkDatabase();
    }

    @Test public void multiResourceWorkIsObservedWithoutDoubleCounting() throws Exception {
        OneTimeWorkRequest request=AndroidTaskResources.tag(
            new OneTimeWorkRequest.Builder(ProbeWorker.class),
            AndroidTaskResources.PROVIDER_NETWORK,
            AndroidTaskResources.CPU_ANALYSIS
        ).setInitialDelay(1,TimeUnit.DAYS).build();

        manager.enqueue(request).getResult().get(5,TimeUnit.SECONDS);

        assertEquals(
            java.util.Set.of(
                AndroidTaskResources.PROVIDER_NETWORK,
                AndroidTaskResources.CPU_ANALYSIS
            ),
            AndroidTaskResources.resources(
                manager.getWorkInfoById(request.getId()).get(5,TimeUnit.SECONDS)
            )
        );

        AndroidTaskResources.Snapshot snapshot=AndroidTaskResources.snapshot(app);
        assertEquals(0,snapshot.runningTotal());
        assertEquals(1,snapshot.waitingTotal());
        assertEquals(1,snapshot.waiting(AndroidTaskResources.PROVIDER_NETWORK));
        assertEquals(1,snapshot.waiting(AndroidTaskResources.CPU_ANALYSIS));
        assertEquals(
            java.util.Set.of(
                AndroidTaskResources.PROVIDER_NETWORK,
                AndroidTaskResources.CPU_ANALYSIS
            ),
            snapshot.resourcesByWork.get(request.getId().toString())
        );

        manager.cancelWorkById(request.getId()).getResult().get(5,TimeUnit.SECONDS);
    }

}
