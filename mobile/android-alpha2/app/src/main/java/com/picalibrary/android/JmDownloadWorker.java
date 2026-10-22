package com.picalibrary.android;

import android.app.*;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.work.*;
import org.json.*;

/** Explicit native JM downloads; no Desktop, account-secret transfer, or automatic body download. */
public final class JmDownloadWorker extends Worker {
    static final String KEY_COMIC="comicId", KEY_EPISODE="episodeId", KEY_SESSION="sessionBinding";
    public JmDownloadWorker(@NonNull Context context, @NonNull WorkerParameters parameters) { super(context, parameters); }

    @NonNull @Override public Result doWork() {
        Context context = getApplicationContext();
        String comic = getInputData().getString(KEY_COMIC), episode = getInputData().getString(KEY_EPISODE);
        String binding = getInputData().getString(KEY_SESSION);
        try {
            JmDownloadStore.remote(comic, "jm:");
            if (episode != null && !episode.isEmpty()) JmDownloadStore.remote(episode, "jm-chapter:");
            JmDownloadSession.require(context, binding);
            setForegroundAsync(foreground(comic, context.getString(R.string.jm_download_title), context.getString(R.string.jm_download_preparing), 0, 0));
            JmClientManager client = JmClientManager.get(context);
            client.status(); JmDownloadSession.require(context, binding);
            JmDownloadEngine.Client bound = new JmDownloadEngine.Client() {
                public void check() throws Exception { JmDownloadSession.require(context, binding); }
                public JSONObject details(String id) throws Exception { return client.downloadDetails(binding, id); }
                public JSONArray episodes(String id) throws Exception { return client.downloadEpisodes(binding, id); }
                public JSONArray pages(String id) throws Exception { return client.downloadPages(binding, id); }
                public byte[] image(String locator) throws Exception { return client.downloadImage(binding, locator); }
            };
            JmDownloadEngine.download(context, bound, comic, episode, new JmDownloadEngine.Listener() {
                public boolean stopped() { return isStopped(); }
                public void progress(String title, String chapter, int done, int total, int pageDone, int pageTotal, boolean reused) {
                    String phase = context.getString(reused ? R.string.jm_download_verifying : R.string.jm_download_running);
                    Data progress = new Data.Builder().putString("title", title).putString("episodeTitle", chapter)
                            .putString("phase", phase).putInt("episodeDone", done).putInt("episodeTotal", total)
                            .putInt("pageDone", pageDone).putInt("pageTotal", pageTotal).build();
                    setProgressAsync(progress);
                    setForegroundAsync(foreground(comic, title, phase + " · " + pageDone + " / " + pageTotal, pageDone, pageTotal));
                }
            });
            JmDownloadJobs.complete(context, comic, getId());
            return Result.success(new Data.Builder().putString("phase", context.getString(R.string.jm_download_complete)).build());
        } catch (JmDownloadSession.Changed changed) {
            return failure(R.string.jm_download_session_changed);
        } catch (JmDownloadEngine.Stopped stopped) {
            return failure(R.string.jm_download_stopped);
        } catch (IllegalArgumentException invalid) {
            return failure(R.string.jm_download_invalid);
        } catch (Exception error) {
            if (isStopped()) return failure(R.string.jm_download_stopped);
            if (getRunAttemptCount() < 3) return Result.retry();
            return failure(R.string.jm_download_failed);
        }
    }

    private Result failure(int message) {
        return Result.failure(new Data.Builder().putString("phase", getApplicationContext().getString(message)).build());
    }
    private ForegroundInfo foreground(String comicId, String title, String text, int done, int total) {
        Context context = getApplicationContext(); String channel = "pica-downloads";
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26) manager.createNotificationChannel(new NotificationChannel(channel, context.getString(R.string.jm_download_title), NotificationManager.IMPORTANCE_LOW));
        PendingIntent pending = PendingIntent.getActivity(context, 0, new Intent(context, DownloadsActivity.class), PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        NotificationCompat.Builder notification = new NotificationCompat.Builder(context, channel)
                .setSmallIcon(android.R.drawable.stat_sys_download).setContentTitle(title).setContentText(text)
                .setContentIntent(pending).setOngoing(true).setOnlyAlertOnce(true).setProgress(total, done, total==0);
        int id = 0x55000000 | (ReaderPolicy.hash(comicId).hashCode() & 0x00ffffff);
        if (Build.VERSION.SDK_INT >= 29) return new ForegroundInfo(id, notification.build(), ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
        return new ForegroundInfo(id, notification.build());
    }
}
