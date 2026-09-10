package com.picalibrary.android;

import android.content.Context;
import androidx.work.*;
import java.util.concurrent.TimeUnit;

final class NativeRecommendationJobs {
    static final String UNIQUE_NAME="native-recommendation-v3";
    static final String TAG="native-recommendation";
    private NativeRecommendationJobs(){}

    private static OneTimeWorkRequest request(){
        Constraints constraints=new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build();
        return new OneTimeWorkRequest.Builder(NativeRecommendationWorker.class).setConstraints(constraints).setBackoffCriteria(BackoffPolicy.EXPONENTIAL,30,TimeUnit.SECONDS).addTag(TAG).build();
    }
    static void enqueue(Context context){WorkManager.getInstance(context.getApplicationContext()).enqueueUniqueWork(UNIQUE_NAME,ExistingWorkPolicy.KEEP,request());}
    static void refresh(Context context){WorkManager.getInstance(context.getApplicationContext()).enqueueUniqueWork(UNIQUE_NAME,ExistingWorkPolicy.REPLACE,request());}
    static void cancel(Context context){WorkManager.getInstance(context.getApplicationContext()).cancelUniqueWork(UNIQUE_NAME);}
}