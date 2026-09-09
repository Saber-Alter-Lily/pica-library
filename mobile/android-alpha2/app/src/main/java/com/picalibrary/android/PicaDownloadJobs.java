package com.picalibrary.android;

import android.content.Context;
import androidx.work.Constraints;
import androidx.work.Data;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.WorkManager;

final class PicaDownloadJobs {
    private PicaDownloadJobs(){}
    static String name(String comicId,String episodeId){return "pica-download-"+ReaderPolicy.hash(comicId+"\n"+(episodeId==null?"":episodeId));}
    static void enqueue(Context context,String comicId,String episodeId){
        Data input=new Data.Builder().putString(PicaDownloadWorker.KEY_COMIC,comicId).putString(PicaDownloadWorker.KEY_EPISODE,episodeId==null?"":episodeId).build();
        Constraints constraints=new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build();
        OneTimeWorkRequest request=new OneTimeWorkRequest.Builder(PicaDownloadWorker.class).setInputData(input).setConstraints(constraints).addTag("pica-download").addTag("comic:"+comicId).build();
        WorkManager.getInstance(context.getApplicationContext()).enqueueUniqueWork(name(comicId,episodeId),ExistingWorkPolicy.REPLACE,request);
    }
}
