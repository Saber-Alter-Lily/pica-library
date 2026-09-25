package com.picalibrary.android;

import android.content.Context;
import androidx.work.*;
import java.util.concurrent.TimeUnit;

/** Lightweight account bootstrap: import Pica favorites/metadata without blocking the login screen. */
final class PicaBootstrapJobs {
    static final String UNIQUE_NAME="pica-account-bootstrap";
    private PicaBootstrapJobs(){}
    private static OneTimeWorkRequest request(){Constraints constraints=new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build();return new OneTimeWorkRequest.Builder(PicaBootstrapWorker.class).setConstraints(constraints).setBackoffCriteria(BackoffPolicy.EXPONENTIAL,15,TimeUnit.SECONDS).addTag("pica-bootstrap").build();}
    private static void enqueue(Context context,ExistingWorkPolicy policy){OneTimeWorkRequest request=request();WorkManager.getInstance(context.getApplicationContext()).enqueueUniqueWork(UNIQUE_NAME,policy,request);MobileTaskRegistryStore.setWorkId(context,"pica-bootstrap",UNIQUE_NAME,request.getId());}
    static void enqueue(Context context){MobileTaskPauseStore.setPaused(context,"pica-bootstrap",UNIQUE_NAME,false);enqueue(context,ExistingWorkPolicy.REPLACE);}
    static void pause(Context context){MobileTaskPauseStore.setPaused(context,"pica-bootstrap",UNIQUE_NAME,true);WorkManager.getInstance(context.getApplicationContext()).cancelUniqueWork(UNIQUE_NAME);}
    static void resume(Context context){MobileTaskPauseStore.setPaused(context,"pica-bootstrap",UNIQUE_NAME,false);enqueue(context,ExistingWorkPolicy.REPLACE);}
    static void cancel(Context context){MobileTaskPauseStore.setPaused(context,"pica-bootstrap",UNIQUE_NAME,false);WorkManager.getInstance(context.getApplicationContext()).cancelUniqueWork(UNIQUE_NAME);}
    static boolean paused(Context context){return MobileTaskPauseStore.isPaused(context,"pica-bootstrap",UNIQUE_NAME);}
}
