package com.picalibrary.android;

import android.content.Context;
import androidx.annotation.NonNull;
import androidx.work.Data;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

/**
 * Imports portable favorites independently of any Activity lifecycle.
 * WorkManager can continue this job while the user browses or reads elsewhere in the app.
 */
public final class FavoriteImportWorker extends Worker {
    static final String KEY_COVERS = "covers";
    static final String KEY_DONE = "done";
    static final String KEY_TOTAL = "total";
    static final String KEY_PHASE = "phase";

    public FavoriteImportWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull @Override public Result doWork() {
        boolean covers = getInputData().getBoolean(KEY_COVERS, false);
        try {
            FavoriteCacheStore.Snapshot snapshot = FavoriteCacheStore.syncFromDesktop(
                getApplicationContext(), covers,
                (done,total,phase) -> setProgressAsync(new Data.Builder()
                    .putInt(KEY_DONE, done)
                    .putInt(KEY_TOTAL, total)
                    .putString(KEY_PHASE, phase)
                    .build())
            );
            UnifiedCatalogStore.reconcileLocalReferences(getApplicationContext());
            return Result.success(new Data.Builder()
                .putInt(KEY_DONE, snapshot.items.size())
                .putInt(KEY_TOTAL, snapshot.items.size())
                .putString(KEY_PHASE, covers ? "收藏和封面后台导入完成" : "收藏后台导入完成")
                .build());
        } catch (Exception e) {
            return Result.retry();
        }
    }
}
