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
    private static void enqueue(Context context,ExistingWorkPolicy policy){OneTimeWorkRequest request=request();WorkManager.getInstance(context.getApplicationContext()).enqueueUniqueWork(UNIQUE_NAME,policy,request);MobileTaskRegistryStore.setWorkId(context,"recommendation",UNIQUE_NAME,request.getId());}
    static void enqueue(Context context){acknowledgePause(context,false);MobileTaskPauseStore.setPaused(context,"recommendation",UNIQUE_NAME,false);enqueue(context,ExistingWorkPolicy.KEEP);}
    static void refresh(Context context){acknowledgePause(context,false);MobileTaskPauseStore.setPaused(context,"recommendation",UNIQUE_NAME,false);enqueue(context,ExistingWorkPolicy.REPLACE);}
    static void pause(Context context){MobileTaskPauseStore.putBoolean(context,"recommendation",UNIQUE_NAME,"pauseAck",false);MobileTaskPauseStore.setPaused(context,"recommendation",UNIQUE_NAME,true);}
    static void resume(Context context){MobileTaskPauseStore.putBoolean(context,"recommendation",UNIQUE_NAME,"pauseAck",false);MobileTaskPauseStore.setPaused(context,"recommendation",UNIQUE_NAME,false);enqueue(context,ExistingWorkPolicy.KEEP);}
    static void cancel(Context context){MobileTaskPauseStore.putBoolean(context,"recommendation",UNIQUE_NAME,"pauseAck",false);MobileTaskPauseStore.setPaused(context,"recommendation",UNIQUE_NAME,false);WorkManager.getInstance(context.getApplicationContext()).cancelUniqueWork(UNIQUE_NAME);}
    static boolean paused(Context context){return MobileTaskPauseStore.isPaused(context,"recommendation",UNIQUE_NAME);}
    static boolean pauseAcknowledged(Context context){return MobileTaskPauseStore.getBoolean(context,"recommendation",UNIQUE_NAME,"pauseAck",false);}
    static void acknowledgePause(Context context,boolean value){MobileTaskPauseStore.putBoolean(context,"recommendation",UNIQUE_NAME,"pauseAck",value);}
}