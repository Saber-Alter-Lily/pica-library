package com.picalibrary.android;

import android.content.Context;
import androidx.work.Constraints;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Data;

final class FavoriteImportJobs {
    static final String UNIQUE_NAME = "portable-favorite-import";
    private FavoriteImportJobs() {}

    private static void enqueue(Context context, boolean covers, ExistingWorkPolicy policy) {
        Constraints constraints = new Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build();
        Data input = new Data.Builder()
            .putBoolean(FavoriteImportWorker.KEY_COVERS, covers)
            .build();
        OneTimeWorkRequest request = AndroidTaskResources.tag(
            new OneTimeWorkRequest.Builder(FavoriteImportWorker.class),
            AndroidTaskResources.BRIDGE_NETWORK,
            AndroidTaskResources.FILESYSTEM_HEAVY
        )
            .setConstraints(constraints)
            .setInputData(input)
            .addTag(UNIQUE_NAME)
            .build();
        WorkManager.getInstance(context.getApplicationContext())
            .enqueueUniqueWork(UNIQUE_NAME, policy, request);
        MobileTaskRegistryStore.setWorkId(
            context,"favorite-import",UNIQUE_NAME,request.getId()
        );
    }

    static void enqueue(Context context, boolean covers) {
        MobileTaskPauseStore.setPaused(context,"favorite-import",UNIQUE_NAME,false);
        MobileTaskPauseStore.putBoolean(context,"favorite-import",UNIQUE_NAME,"covers",covers);
        enqueue(context,covers,ExistingWorkPolicy.REPLACE);
    }

    static void pause(Context context) {
        MobileTaskPauseStore.setPaused(context,"favorite-import",UNIQUE_NAME,true);
        WorkManager.getInstance(context.getApplicationContext()).cancelUniqueWork(UNIQUE_NAME);
    }

    static void resume(Context context, boolean covers) {
        MobileTaskPauseStore.setPaused(context,"favorite-import",UNIQUE_NAME,false);
        MobileTaskPauseStore.putBoolean(context,"favorite-import",UNIQUE_NAME,"covers",covers);
        enqueue(context,covers,ExistingWorkPolicy.REPLACE);
    }

    static void resume(Context context) {
        resume(context,MobileTaskPauseStore.getBoolean(context,"favorite-import",UNIQUE_NAME,"covers",false));
    }

    static void cancel(Context context) {
        MobileTaskPauseStore.setPaused(context,"favorite-import",UNIQUE_NAME,false);
        MobileTaskRegistryStore.clearWorkId(context,"favorite-import",UNIQUE_NAME);
        WorkManager.getInstance(context.getApplicationContext()).cancelUniqueWork(UNIQUE_NAME);
    }

    static void complete(Context context) {
        MobileTaskRegistryStore.clearWorkId(context,"favorite-import",UNIQUE_NAME);
    }

    static boolean paused(Context context) {
        return MobileTaskPauseStore.isPaused(context,"favorite-import",UNIQUE_NAME);
    }
}
