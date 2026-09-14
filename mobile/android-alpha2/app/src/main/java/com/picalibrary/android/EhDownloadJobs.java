package com.picalibrary.android;

import android.content.Context;
import androidx.work.*;
import java.util.concurrent.TimeUnit;

final class EhDownloadJobs {
    private EhDownloadJobs(){}
    static String name(String comicId){return "eh-download-"+ReaderPolicy.hash(comicId);}
    static void enqueue(Context context,String comicId){
        Data input=new Data.Builder().putString(EhDownloadWorker.KEY_COMIC,comicId).build();NetworkType network=StorageSettings.downloadWifiOnly(context)?NetworkType.UNMETERED:NetworkType.CONNECTED;Constraints constraints=new Constraints.Builder().setRequiredNetworkType(network).build();
        OneTimeWorkRequest request=new OneTimeWorkRequest.Builder(EhDownloadWorker.class).setInputData(input).setConstraints(constraints).setBackoffCriteria(BackoffPolicy.EXPONENTIAL,15,TimeUnit.SECONDS).addTag("eh-download").addTag("comic:"+comicId).build();
        WorkManager.getInstance(context.getApplicationContext()).enqueueUniqueWork(name(comicId),ExistingWorkPolicy.KEEP,request);
    }
    static void cancel(Context context,String comicId){WorkManager.getInstance(context.getApplicationContext()).cancelUniqueWork(name(comicId));}
}
