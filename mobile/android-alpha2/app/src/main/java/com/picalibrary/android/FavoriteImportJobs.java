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

    static void enqueue(Context context, boolean covers) {
        Constraints constraints = new Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build();
        Data input = new Data.Builder()
            .putBoolean(FavoriteImportWorker.KEY_COVERS, covers)
            .build();
        OneTimeWorkRequest request = new OneTimeWorkRequest.Builder(FavoriteImportWorker.class)
            .setConstraints(constraints)
            .setInputData(input)
            .addTag(UNIQUE_NAME)
            .build();
        WorkManager.getInstance(context.getApplicationContext())
            .enqueueUniqueWork(UNIQUE_NAME, ExistingWorkPolicy.REPLACE, request);
    }
}
