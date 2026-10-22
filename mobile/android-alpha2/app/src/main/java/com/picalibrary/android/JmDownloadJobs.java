package com.picalibrary.android;

import android.content.Context;
import androidx.work.*;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

/** One active JM job per comic. A duplicate tap cannot launch or relabel a second task. */
final class JmDownloadJobs {
    private JmDownloadJobs() {}
    static String name(String comicId) { JmDownloadStore.remote(comicId, "jm:"); return "jm-download-" + ReaderPolicy.hash(comicId); }
    private static void enqueue(Context context, String comicId, String episodeId, ExistingWorkPolicy policy) {
        JmDownloadStore.remote(comicId, "jm:");
        String chapter = episodeId == null ? "" : episodeId;
        if (!chapter.isEmpty()) JmDownloadStore.remote(chapter, "jm-chapter:");
        Data input = new Data.Builder().putString(JmDownloadWorker.KEY_COMIC, comicId)
                .putString(JmDownloadWorker.KEY_EPISODE, chapter)
                .putString(JmDownloadWorker.KEY_SESSION, JmDownloadSession.current(context)).build();
        Constraints constraints = new Constraints.Builder().setRequiredNetworkType(
                StorageSettings.downloadWifiOnly(context) ? NetworkType.UNMETERED : NetworkType.CONNECTED).build();
        OneTimeWorkRequest request = AndroidTaskResources.tag(new OneTimeWorkRequest.Builder(JmDownloadWorker.class),
                AndroidTaskResources.MEDIA_NETWORK, AndroidTaskResources.FILESYSTEM_HEAVY)
                .setInputData(input).setConstraints(constraints).setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 15, TimeUnit.SECONDS)
                .addTag("jm-download").addTag("comic:"+comicId).addTag("episode:"+(chapter.isEmpty()?"ALL":chapter)).build();
        WorkManager.getInstance(context.getApplicationContext()).enqueueUniqueWork(name(comicId), policy, request);
        // TaskCenter reconstructs the ACTUAL persisted work ID from tags. KEEP may discard this request.
    }
    static void enqueue(Context context, String comicId, String episodeId) {
        MobileTaskPauseStore.setPaused(context, "download", name(comicId), false);
        enqueue(context, comicId, episodeId, ExistingWorkPolicy.KEEP);
    }
    static void pause(Context context, String comicId) {
        MobileTaskPauseStore.setPaused(context, "download", name(comicId), true);
        WorkManager.getInstance(context).cancelUniqueWork(name(comicId));
    }
    static void resume(Context context, String comicId, String episodeId) {
        MobileTaskPauseStore.setPaused(context, "download", name(comicId), false);
        enqueue(context, comicId, episodeId, ExistingWorkPolicy.REPLACE);
    }
    static void cancel(Context context, String comicId) {
        MobileTaskPauseStore.setPaused(context, "download", name(comicId), false);
        for (MobileTaskRegistryStore.DownloadRef ref : MobileTaskRegistryStore.downloads(context))
            if ("jm".equals(ref.provider) && comicId.equals(ref.comicId))
                MobileTaskRegistryStore.unregisterDownload(context, ref.provider, ref.comicId, ref.episodeId);
        WorkManager.getInstance(context).cancelUniqueWork(name(comicId));
    }
    static boolean paused(Context context, String comicId) { return MobileTaskPauseStore.isPaused(context, "download", name(comicId)); }
    static void complete(Context context, String comicId, UUID workId) {
        for (MobileTaskRegistryStore.DownloadRef ref : MobileTaskRegistryStore.downloads(context))
            if ("jm".equals(ref.provider) && comicId.equals(ref.comicId) && workId.toString().equals(ref.workId))
                MobileTaskRegistryStore.unregisterDownload(context, ref.provider, ref.comicId, ref.episodeId);
    }
}
