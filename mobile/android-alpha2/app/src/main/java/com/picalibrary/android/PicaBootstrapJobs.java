package com.picalibrary.android;

import android.content.Context;
import androidx.work.*;
import java.util.concurrent.TimeUnit;

/** Lightweight account bootstrap: import Pica favorites/metadata without blocking the login screen. */
final class PicaBootstrapJobs {
    static final String UNIQUE_NAME="pica-account-bootstrap";
    private PicaBootstrapJobs(){}
    static void enqueue(Context context){Constraints constraints=new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build();OneTimeWorkRequest request=new OneTimeWorkRequest.Builder(PicaBootstrapWorker.class).setConstraints(constraints).setBackoffCriteria(BackoffPolicy.EXPONENTIAL,15,TimeUnit.SECONDS).addTag("pica-bootstrap").build();WorkManager.getInstance(context.getApplicationContext()).enqueueUniqueWork(UNIQUE_NAME,ExistingWorkPolicy.REPLACE,request);}
    static void cancel(Context context){WorkManager.getInstance(context.getApplicationContext()).cancelUniqueWork(UNIQUE_NAME);}
}
