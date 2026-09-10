package com.picalibrary.android;

import android.content.Context;
import androidx.work.*;
import java.util.concurrent.TimeUnit;

/** One immediate-but-rate-limited check plus one durable periodic Preview check. */
final class UpdateCheckJobs {
    static final String UNIQUE_ONCE="android-preview-update-check",UNIQUE_PERIODIC="android-preview-update-periodic";
    private UpdateCheckJobs(){}
    static void schedule(Context context){
        Context app=context.getApplicationContext();Constraints network=new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build();
        OneTimeWorkRequest once=new OneTimeWorkRequest.Builder(UpdateCheckWorker.class).setConstraints(network).addTag("update-check").build();
        WorkManager.getInstance(app).enqueueUniqueWork(UNIQUE_ONCE,ExistingWorkPolicy.KEEP,once);
        PeriodicWorkRequest periodic=new PeriodicWorkRequest.Builder(UpdateCheckWorker.class,12,TimeUnit.HOURS).setConstraints(network).addTag("update-check").build();
        WorkManager.getInstance(app).enqueueUniquePeriodicWork(UNIQUE_PERIODIC,ExistingPeriodicWorkPolicy.KEEP,periodic);
    }
}
