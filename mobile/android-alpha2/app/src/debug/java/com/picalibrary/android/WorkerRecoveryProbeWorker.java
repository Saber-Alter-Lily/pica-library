package com.picalibrary.android;

import android.content.Context;
import androidx.annotation.NonNull;
import androidx.work.Data;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

/**
 * Debug-only WorkManager process-death probe for P2-G14.
 *
 * This class is excluded from release builds by the Android debug source set. The force-stop
 * harness leaves it RUNNING, kills the app process externally, then verifies WorkManager starts a
 * fresh instance after relaunch.
 */
public final class WorkerRecoveryProbeWorker extends Worker {
    static final String UNIQUE_NAME = "p2-g14-running-probe";
    static final String PREFS = "p2-g14-worker-recovery";
    static final String KEY_RUN_COUNT = "probeRunCount";

    public WorkerRecoveryProbeWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull @Override public Result doWork() {
        Context app = getApplicationContext();
        int runCount = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getInt(KEY_RUN_COUNT, 0) + 1;
        app.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit().putInt(KEY_RUN_COUNT, runCount).commit();
        setProgressAsync(new Data.Builder()
            .putString("phase", "P2-G14 RUNNING")
            .putInt("runCount", runCount)
            .build());

        try {
            while (!isStopped()) Thread.sleep(200L);
        } catch (InterruptedException ignored) {
            Thread.currentThread().interrupt();
        }
        return Result.retry();
    }
}
