package com.picalibrary.android;

import android.content.Context;
import androidx.work.*;
import java.util.concurrent.TimeUnit;

final class PicaDownloadJobs {
    private PicaDownloadJobs(){}
    static String name(String comicId,String episodeId){return "pica-download-"+ReaderPolicy.hash(comicId+"\n"+(episodeId==null?"":episodeId));}
    private static void enqueue(Context context,String comicId,String episodeId,ExistingWorkPolicy policy){
        String ep=episodeId==null?"":episodeId;Data input=new Data.Builder().putString(PicaDownloadWorker.KEY_COMIC,comicId).putString(PicaDownloadWorker.KEY_EPISODE,ep).build();NetworkType network=StorageSettings.downloadWifiOnly(context)?NetworkType.UNMETERED:NetworkType.CONNECTED;Constraints constraints=new Constraints.Builder().setRequiredNetworkType(network).build();
        OneTimeWorkRequest request=new OneTimeWorkRequest.Builder(PicaDownloadWorker.class).setInputData(input).setConstraints(constraints).setBackoffCriteria(BackoffPolicy.EXPONENTIAL,15,TimeUnit.SECONDS).addTag("pica-download").addTag("comic:"+comicId).addTag(ep.isEmpty()?"episode:ALL":"episode:"+ep).build();
        WorkManager.getInstance(context.getApplicationContext()).enqueueUniqueWork(name(comicId,ep),policy,request);
    }
    static void enqueue(Context context,String comicId,String episodeId){String ep=episodeId==null?"":episodeId;MobileTaskPauseStore.setPaused(context,"download",name(comicId,ep),false);enqueue(context,comicId,ep,ExistingWorkPolicy.KEEP);}
    static void pause(Context context,String comicId,String episodeId){String ep=episodeId==null?"":episodeId;MobileTaskPauseStore.setPaused(context,"download",name(comicId,ep),true);WorkManager.getInstance(context.getApplicationContext()).cancelUniqueWork(name(comicId,ep));}
    static void resume(Context context,String comicId,String episodeId){String ep=episodeId==null?"":episodeId;MobileTaskPauseStore.setPaused(context,"download",name(comicId,ep),false);enqueue(context,comicId,ep,ExistingWorkPolicy.REPLACE);}
    static void cancel(Context context,String comicId,String episodeId){String ep=episodeId==null?"":episodeId;MobileTaskPauseStore.setPaused(context,"download",name(comicId,ep),false);WorkManager.getInstance(context.getApplicationContext()).cancelUniqueWork(name(comicId,ep));}
    static boolean paused(Context context,String comicId,String episodeId){String ep=episodeId==null?"":episodeId;return MobileTaskPauseStore.isPaused(context,"download",name(comicId,ep));}
}
