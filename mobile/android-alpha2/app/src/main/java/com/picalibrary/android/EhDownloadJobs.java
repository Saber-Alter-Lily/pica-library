package com.picalibrary.android;

import android.content.Context;
import androidx.work.*;
import java.util.concurrent.TimeUnit;

final class EhDownloadJobs {
    private EhDownloadJobs(){}
    static String name(String comicId){return "eh-download-"+ReaderPolicy.hash(comicId);}
    private static void enqueue(Context context,String comicId,ExistingWorkPolicy policy){
        Data input=new Data.Builder().putString(EhDownloadWorker.KEY_COMIC,comicId).build();NetworkType network=StorageSettings.downloadWifiOnly(context)?NetworkType.UNMETERED:NetworkType.CONNECTED;Constraints constraints=new Constraints.Builder().setRequiredNetworkType(network).build();
        OneTimeWorkRequest request=new OneTimeWorkRequest.Builder(EhDownloadWorker.class).setInputData(input).setConstraints(constraints).setBackoffCriteria(BackoffPolicy.EXPONENTIAL,15,TimeUnit.SECONDS).addTag("eh-download").addTag("comic:"+comicId).build();
        WorkManager.getInstance(context.getApplicationContext()).enqueueUniqueWork(name(comicId),policy,request);
        MobileTaskRegistryStore.registerDownload(context,"eh",comicId,"",request.getId());
    }
    static void enqueue(Context context,String comicId){MobileTaskPauseStore.setPaused(context,"download",name(comicId),false);enqueue(context,comicId,ExistingWorkPolicy.KEEP);}
    static void pause(Context context,String comicId){MobileTaskPauseStore.setPaused(context,"download",name(comicId),true);WorkManager.getInstance(context.getApplicationContext()).cancelUniqueWork(name(comicId));}
    static void resume(Context context,String comicId){MobileTaskPauseStore.setPaused(context,"download",name(comicId),false);enqueue(context,comicId,ExistingWorkPolicy.REPLACE);}
    static void cancel(Context context,String comicId){MobileTaskPauseStore.setPaused(context,"download",name(comicId),false);MobileTaskRegistryStore.unregisterDownload(context,"eh",comicId,"");WorkManager.getInstance(context.getApplicationContext()).cancelUniqueWork(name(comicId));}
    static void complete(Context context,String comicId){MobileTaskRegistryStore.unregisterDownload(context,"eh",comicId,"");}
    static boolean paused(Context context,String comicId){return MobileTaskPauseStore.isPaused(context,"download",name(comicId));}
}
