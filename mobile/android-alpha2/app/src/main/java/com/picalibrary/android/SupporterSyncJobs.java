package com.picalibrary.android;

import android.content.Context;
import androidx.work.*;
import java.util.concurrent.TimeUnit;

final class SupporterSyncJobs {
    private static final String UNIQUE="supporter-entitlement-refresh";
    private SupporterSyncJobs(){}
    static void enqueue(Context c){if(!BridgeStore.paired(c))return;Constraints constraints=new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build();OneTimeWorkRequest request=new OneTimeWorkRequest.Builder(SupporterEntitlementWorker.class).setConstraints(constraints).setBackoffCriteria(BackoffPolicy.EXPONENTIAL,15,TimeUnit.SECONDS).build();WorkManager.getInstance(c.getApplicationContext()).enqueueUniqueWork(UNIQUE,ExistingWorkPolicy.REPLACE,request);}
}
