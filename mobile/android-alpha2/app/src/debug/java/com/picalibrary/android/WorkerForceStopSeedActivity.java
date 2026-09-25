package com.picalibrary.android;

import android.app.Activity;
import android.content.Context;
import android.os.Bundle;
import android.os.Process;
import android.widget.TextView;

import androidx.work.Data;
import androidx.work.ExistingWorkPolicy;
import androidx.work.OneTimeWorkRequest;
import androidx.work.WorkInfo;
import androidx.work.WorkManager;

import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

/**
 * Debug-only P2-G15 seed surface.
 *
 * It intentionally runs as a normal app Activity, not under instrumentation. This keeps the
 * measured process-death boundary to exactly one host-side adb force-stop.
 */
public final class WorkerForceStopSeedActivity extends Activity {
    static final String HARNESS_PREFS = WorkerRecoveryProbeWorker.PREFS;
    static final String KEY_SEED_PID = "seedPid";
    static final String KEY_FAVORITE = "favoriteWorkId";
    static final String KEY_BOOTSTRAP = "bootstrapWorkId";
    static final String KEY_RECOMMENDATION = "recommendationWorkId";
    static final String KEY_PICA_ACTIVE = "picaActiveWorkId";
    static final String KEY_EH_PAUSED = "ehPausedWorkId";
    static final String KEY_PICA_CANCELLED = "picaCancelledWorkId";
    static final String KEY_PROBE = "probeWorkId";
    static final String READY_FILE = "p2-g15-ready";
    static final String FAILURE_FILE = "p2-g15-seed-failure";

    static final String PICA_ACTIVE_COMIC = "g15pactive";
    static final String PICA_CANCELLED_COMIC = "g15pcancel";
    static final String EH_PAUSED_COMIC = "g15ehpause";

    private final ExecutorService worker = Executors.newSingleThreadExecutor();

    @Override protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        TextView status = new TextView(this);
        status.setPadding(32, 32, 32, 32);
        status.setText("P2-G15 recovery seed: preparing");
        setContentView(status);
        worker.execute(() -> {
            try {
                seed();
                runOnUiThread(() -> status.setText("P2-G15 recovery seed: READY"));
            } catch (Throwable error) {
                writeFile(FAILURE_FILE, error.getClass().getName() + ": " +
                    (error.getMessage() == null ? "" : error.getMessage()) + "\n");
                runOnUiThread(() -> status.setText("P2-G15 recovery seed: FAILED"));
            }
        });
    }

    private void seed() throws Exception {
        Context app = getApplicationContext();
        WorkManager manager = WorkManager.getInstance(app);

        manager.cancelAllWork().getResult().get(10, TimeUnit.SECONDS);
        manager.pruneWork().getResult().get(10, TimeUnit.SECONDS);

        app.getSharedPreferences("background-task-registry-v1", Context.MODE_PRIVATE)
            .edit().clear().commit();
        app.getSharedPreferences("background-task-pauses-v1", Context.MODE_PRIVATE)
            .edit().clear().commit();
        app.getSharedPreferences(HARNESS_PREFS, Context.MODE_PRIVATE)
            .edit().clear().commit();
        new File(app.getFilesDir(), READY_FILE).delete();
        new File(app.getFilesDir(), FAILURE_FILE).delete();
        new File(app.getFilesDir(), WorkerRecoveryProbeWorker.RUN_COUNT_FILE).delete();

        verifyTerminalIdentityCleanup(app);

        OneTimeWorkRequest favorite = delayedFavorite();
        enqueueUnique(manager, FavoriteImportJobs.UNIQUE_NAME, favorite);
        MobileTaskRegistryStore.setWorkId(
            app, "favorite-import", FavoriteImportJobs.UNIQUE_NAME, favorite.getId()
        );
        FavoriteImportJobs.pause(app);
        awaitState(manager, favorite.getId(), WorkInfo.State.CANCELLED);
        require(FavoriteImportJobs.paused(app), "favorite pause marker missing");
        require(
            favorite.getId().toString().equals(
                MobileTaskRegistryStore.workId(
                    app, "favorite-import", FavoriteImportJobs.UNIQUE_NAME
                )
            ),
            "favorite current UUID not retained while paused"
        );

        OneTimeWorkRequest bootstrapCancelled = delayed(PicaBootstrapWorker.class);
        enqueueUnique(manager, PicaBootstrapJobs.UNIQUE_NAME, bootstrapCancelled);
        MobileTaskRegistryStore.setWorkId(
            app, "pica-bootstrap", PicaBootstrapJobs.UNIQUE_NAME, bootstrapCancelled.getId()
        );
        PicaBootstrapJobs.cancel(app);
        awaitState(manager, bootstrapCancelled.getId(), WorkInfo.State.CANCELLED);
        require(
            MobileTaskRegistryStore.workId(
                app, "pica-bootstrap", PicaBootstrapJobs.UNIQUE_NAME
            ).isEmpty(),
            "explicit bootstrap cancel retained recovery UUID"
        );

        OneTimeWorkRequest bootstrap = delayed(PicaBootstrapWorker.class);
        enqueueUnique(manager, PicaBootstrapJobs.UNIQUE_NAME, bootstrap);
        MobileTaskRegistryStore.setWorkId(
            app, "pica-bootstrap", PicaBootstrapJobs.UNIQUE_NAME, bootstrap.getId()
        );
        awaitState(manager, bootstrap.getId(), WorkInfo.State.ENQUEUED);

        OneTimeWorkRequest recommendationCancelled = delayed(NativeRecommendationWorker.class);
        enqueueUnique(manager, NativeRecommendationJobs.UNIQUE_NAME, recommendationCancelled);
        MobileTaskRegistryStore.setWorkId(
            app, "recommendation", NativeRecommendationJobs.UNIQUE_NAME,
            recommendationCancelled.getId()
        );
        NativeRecommendationJobs.cancel(app);
        awaitState(manager, recommendationCancelled.getId(), WorkInfo.State.CANCELLED);
        require(
            MobileTaskRegistryStore.workId(
                app, "recommendation", NativeRecommendationJobs.UNIQUE_NAME
            ).isEmpty(),
            "explicit recommendation cancel retained recovery UUID"
        );

        OneTimeWorkRequest recommendation = delayed(NativeRecommendationWorker.class);
        enqueueUnique(manager, NativeRecommendationJobs.UNIQUE_NAME, recommendation);
        MobileTaskRegistryStore.setWorkId(
            app, "recommendation", NativeRecommendationJobs.UNIQUE_NAME, recommendation.getId()
        );
        awaitState(manager, recommendation.getId(), WorkInfo.State.ENQUEUED);

        OneTimeWorkRequest picaActive = delayedPica(PICA_ACTIVE_COMIC);
        enqueueUnique(manager, PicaDownloadJobs.name(PICA_ACTIVE_COMIC, ""), picaActive);
        MobileTaskRegistryStore.registerDownload(
            app, "pica", PICA_ACTIVE_COMIC, "", picaActive.getId()
        );
        awaitState(manager, picaActive.getId(), WorkInfo.State.ENQUEUED);

        OneTimeWorkRequest picaCancelled = delayedPica(PICA_CANCELLED_COMIC);
        enqueueUnique(manager, PicaDownloadJobs.name(PICA_CANCELLED_COMIC, ""), picaCancelled);
        MobileTaskRegistryStore.registerDownload(
            app, "pica", PICA_CANCELLED_COMIC, "", picaCancelled.getId()
        );
        PicaDownloadJobs.cancel(app, PICA_CANCELLED_COMIC, "");
        awaitState(manager, picaCancelled.getId(), WorkInfo.State.CANCELLED);
        require(
            downloadRef(app, "pica", PICA_CANCELLED_COMIC, "") == null,
            "explicit Pica cancel retained registry identity"
        );

        OneTimeWorkRequest ehPaused = delayedEh(EH_PAUSED_COMIC);
        enqueueUnique(manager, EhDownloadJobs.name(EH_PAUSED_COMIC), ehPaused);
        MobileTaskRegistryStore.registerDownload(
            app, "eh", EH_PAUSED_COMIC, "", ehPaused.getId()
        );
        EhDownloadJobs.pause(app, EH_PAUSED_COMIC);
        awaitState(manager, ehPaused.getId(), WorkInfo.State.CANCELLED);
        require(EhDownloadJobs.paused(app, EH_PAUSED_COMIC), "E-H pause marker missing");
        require(
            downloadRef(app, "eh", EH_PAUSED_COMIC, "") != null,
            "paused E-H registry identity missing"
        );

        OneTimeWorkRequest probe =
            new OneTimeWorkRequest.Builder(WorkerRecoveryProbeWorker.class).build();
        enqueueUnique(manager, WorkerRecoveryProbeWorker.UNIQUE_NAME, probe);
        awaitState(manager, probe.getId(), WorkInfo.State.RUNNING);
        awaitProbeRuns(app, 1);

        boolean committed = app.getSharedPreferences(HARNESS_PREFS, Context.MODE_PRIVATE).edit()
            .putInt(KEY_SEED_PID, Process.myPid())
            .putString(KEY_FAVORITE, favorite.getId().toString())
            .putString(KEY_BOOTSTRAP, bootstrap.getId().toString())
            .putString(KEY_RECOMMENDATION, recommendation.getId().toString())
            .putString(KEY_PICA_ACTIVE, picaActive.getId().toString())
            .putString(KEY_EH_PAUSED, ehPaused.getId().toString())
            .putString(KEY_PICA_CANCELLED, picaCancelled.getId().toString())
            .putString(KEY_PROBE, probe.getId().toString())
            .commit();
        require(committed, "harness SharedPreferences commit failed");

        require(
            app.getSharedPreferences("background-task-registry-v1", Context.MODE_PRIVATE)
                .edit().putLong("g15-flush", System.nanoTime()).commit(),
            "registry fsync commit failed"
        );
        require(
            app.getSharedPreferences("background-task-pauses-v1", Context.MODE_PRIVATE)
                .edit().putLong("g15-flush", System.nanoTime()).commit(),
            "pause fsync commit failed"
        );

        writeFile(READY_FILE, "READY pid=" + Process.myPid() + "\n");
    }

    private void writeFile(String name, String value) {
        File file = new File(getApplicationContext().getFilesDir(), name);
        try (FileOutputStream out = new FileOutputStream(file, false)) {
            out.write(value.getBytes(StandardCharsets.UTF_8));
            out.getFD().sync();
        } catch (Exception ignored) {}
    }

    private static void verifyTerminalIdentityCleanup(Context app) {
        MobileTaskRegistryStore.setWorkId(
            app, "favorite-import", FavoriteImportJobs.UNIQUE_NAME, UUID.randomUUID()
        );
        FavoriteImportJobs.complete(app);
        require(
            MobileTaskRegistryStore.workId(
                app, "favorite-import", FavoriteImportJobs.UNIQUE_NAME
            ).isEmpty(),
            "favorite success cleanup failed"
        );

        MobileTaskRegistryStore.setWorkId(
            app, "pica-bootstrap", PicaBootstrapJobs.UNIQUE_NAME, UUID.randomUUID()
        );
        PicaBootstrapJobs.complete(app);
        require(
            MobileTaskRegistryStore.workId(
                app, "pica-bootstrap", PicaBootstrapJobs.UNIQUE_NAME
            ).isEmpty(),
            "bootstrap success cleanup failed"
        );

        MobileTaskRegistryStore.setWorkId(
            app, "recommendation", NativeRecommendationJobs.UNIQUE_NAME, UUID.randomUUID()
        );
        NativeRecommendationJobs.complete(app);
        require(
            MobileTaskRegistryStore.workId(
                app, "recommendation", NativeRecommendationJobs.UNIQUE_NAME
            ).isEmpty(),
            "recommendation success cleanup failed"
        );

        MobileTaskRegistryStore.registerDownload(
            app, "pica", "g15complete", "", UUID.randomUUID()
        );
        PicaDownloadJobs.complete(app, "g15complete", "");
        require(
            downloadRef(app, "pica", "g15complete", "") == null,
            "Pica success cleanup failed"
        );
    }

    private static OneTimeWorkRequest delayedFavorite() {
        return new OneTimeWorkRequest.Builder(FavoriteImportWorker.class)
            .setInitialDelay(1, TimeUnit.DAYS)
            .setInputData(
                new Data.Builder().putBoolean(FavoriteImportWorker.KEY_COVERS, false).build()
            )
            .addTag(FavoriteImportJobs.UNIQUE_NAME)
            .build();
    }

    private static OneTimeWorkRequest delayedPica(String comicId) {
        return new OneTimeWorkRequest.Builder(PicaDownloadWorker.class)
            .setInitialDelay(1, TimeUnit.DAYS)
            .setInputData(
                new Data.Builder()
                    .putString(PicaDownloadWorker.KEY_COMIC, comicId)
                    .putString(PicaDownloadWorker.KEY_EPISODE, "")
                    .build()
            )
            .addTag("pica-download")
            .addTag("comic:" + comicId)
            .addTag("episode:ALL")
            .build();
    }

    private static OneTimeWorkRequest delayedEh(String comicId) {
        return new OneTimeWorkRequest.Builder(EhDownloadWorker.class)
            .setInitialDelay(1, TimeUnit.DAYS)
            .setInputData(
                new Data.Builder().putString(EhDownloadWorker.KEY_COMIC, comicId).build()
            )
            .addTag("eh-download")
            .addTag("comic:" + comicId)
            .build();
    }

    private static OneTimeWorkRequest delayed(
        Class<? extends androidx.work.ListenableWorker> workerClass
    ) {
        return new OneTimeWorkRequest.Builder(workerClass)
            .setInitialDelay(1, TimeUnit.DAYS)
            .build();
    }

    private static void enqueueUnique(
        WorkManager manager, String name, OneTimeWorkRequest request
    ) throws Exception {
        manager.enqueueUniqueWork(name, ExistingWorkPolicy.REPLACE, request)
            .getResult().get(10, TimeUnit.SECONDS);
    }

    private static void awaitState(
        WorkManager manager, UUID id, WorkInfo.State expected
    ) throws Exception {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(10);
        WorkInfo value = null;
        while (System.nanoTime() < deadline) {
            value = manager.getWorkInfoById(id).get(10, TimeUnit.SECONDS);
            if (value != null && value.getState() == expected) return;
            Thread.sleep(100L);
        }
        throw new IllegalStateException(
            "WorkInfo " + id + " expected " + expected + " but was " +
            (value == null ? "null" : value.getState())
        );
    }

    private static void awaitProbeRuns(Context app, int expected) throws Exception {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(15);
        int observed = 0;
        while (System.nanoTime() < deadline) {
            observed = app.getSharedPreferences(
                WorkerRecoveryProbeWorker.PREFS, Context.MODE_PRIVATE
            ).getInt(WorkerRecoveryProbeWorker.KEY_RUN_COUNT, 0);
            if (observed >= expected) return;
            Thread.sleep(100L);
        }
        throw new IllegalStateException(
            "probe expected runCount >= " + expected + " but was " + observed
        );
    }

    static MobileTaskRegistryStore.DownloadRef downloadRef(
        Context app, String provider, String comicId, String episodeId
    ) {
        for (MobileTaskRegistryStore.DownloadRef ref : MobileTaskRegistryStore.downloads(app)) {
            if (
                provider.equals(ref.provider) &&
                comicId.equals(ref.comicId) &&
                episodeId.equals(ref.episodeId)
            ) return ref;
        }
        return null;
    }

    private static void require(boolean value, String message) {
        if (!value) throw new IllegalStateException(message);
    }

    @Override protected void onDestroy() {
        worker.shutdownNow();
        super.onDestroy();
    }
}
