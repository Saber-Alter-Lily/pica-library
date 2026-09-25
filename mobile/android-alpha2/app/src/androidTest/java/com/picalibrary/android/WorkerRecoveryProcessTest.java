package com.picalibrary.android;

import static org.junit.Assert.*;

import android.content.Context;
import android.os.Process;
import android.view.View;
import android.view.ViewGroup;
import android.widget.TextView;

import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.work.Data;
import androidx.work.ExistingWorkPolicy;
import androidx.work.OneTimeWorkRequest;
import androidx.work.WorkInfo;
import androidx.work.WorkManager;

import org.junit.Test;
import org.junit.runner.RunWith;

import java.util.List;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

/**
 * P2-G14 is intentionally split across two instrumentation invocations.
 *
 * The host script runs seedDurableRecoveryState(), force-stops the target package with adb,
 * then starts verifyDurableRecoveryStateAfterForceStop() in a fresh process. This exercises the
 * real WorkManager database + app-private SharedPreferences instead of a same-process fake restart.
 */
@RunWith(AndroidJUnit4.class)
public final class WorkerRecoveryProcessTest {
    private static final String HARNESS_PREFS = "p2-g14-worker-recovery";
    private static final String KEY_SEED_PID = "seedPid";
    private static final String KEY_FAVORITE = "favoriteWorkId";
    private static final String KEY_BOOTSTRAP = "bootstrapWorkId";
    private static final String KEY_RECOMMENDATION = "recommendationWorkId";
    private static final String KEY_PICA_ACTIVE = "picaActiveWorkId";
    private static final String KEY_EH_PAUSED = "ehPausedWorkId";
    private static final String KEY_PICA_CANCELLED = "picaCancelledWorkId";

    private static final String PICA_ACTIVE_COMIC = "g14pactive";
    private static final String PICA_CANCELLED_COMIC = "g14pcancel";
    private static final String EH_PAUSED_COMIC = "g14ehpause";

    private Context app() {
        return InstrumentationRegistry.getInstrumentation().getTargetContext().getApplicationContext();
    }

    @Test public void seedDurableRecoveryState() throws Exception {
        Context app = app();
        WorkManager manager = WorkManager.getInstance(app);
        manager.cancelAllWork().getResult().get(10, TimeUnit.SECONDS);
        manager.pruneWork().getResult().get(10, TimeUnit.SECONDS);

        app.getSharedPreferences("background-task-registry-v1", Context.MODE_PRIVATE).edit().clear().commit();
        app.getSharedPreferences("background-task-pauses-v1", Context.MODE_PRIVATE).edit().clear().commit();
        app.getSharedPreferences(HARNESS_PREFS, Context.MODE_PRIVATE).edit().clear().commit();

        verifyTerminalIdentityCleanup(app);

        OneTimeWorkRequest favorite = delayedFavorite();
        enqueueUnique(manager, FavoriteImportJobs.UNIQUE_NAME, favorite);
        MobileTaskRegistryStore.setWorkId(app, "favorite-import", FavoriteImportJobs.UNIQUE_NAME, favorite.getId());
        FavoriteImportJobs.pause(app);
        awaitState(manager, favorite.getId(), WorkInfo.State.CANCELLED);
        assertTrue(FavoriteImportJobs.paused(app));
        assertEquals(favorite.getId().toString(), MobileTaskRegistryStore.workId(app, "favorite-import", FavoriteImportJobs.UNIQUE_NAME));

        OneTimeWorkRequest bootstrapCancelled = delayed(PicaBootstrapWorker.class);
        enqueueUnique(manager, PicaBootstrapJobs.UNIQUE_NAME, bootstrapCancelled);
        MobileTaskRegistryStore.setWorkId(app, "pica-bootstrap", PicaBootstrapJobs.UNIQUE_NAME, bootstrapCancelled.getId());
        PicaBootstrapJobs.cancel(app);
        awaitState(manager, bootstrapCancelled.getId(), WorkInfo.State.CANCELLED);
        assertEquals("", MobileTaskRegistryStore.workId(app, "pica-bootstrap", PicaBootstrapJobs.UNIQUE_NAME));

        OneTimeWorkRequest bootstrap = delayed(PicaBootstrapWorker.class);
        enqueueUnique(manager, PicaBootstrapJobs.UNIQUE_NAME, bootstrap);
        MobileTaskRegistryStore.setWorkId(app, "pica-bootstrap", PicaBootstrapJobs.UNIQUE_NAME, bootstrap.getId());
        awaitState(manager, bootstrap.getId(), WorkInfo.State.ENQUEUED);

        OneTimeWorkRequest recommendationCancelled = delayed(NativeRecommendationWorker.class);
        enqueueUnique(manager, NativeRecommendationJobs.UNIQUE_NAME, recommendationCancelled);
        MobileTaskRegistryStore.setWorkId(app, "recommendation", NativeRecommendationJobs.UNIQUE_NAME, recommendationCancelled.getId());
        NativeRecommendationJobs.cancel(app);
        awaitState(manager, recommendationCancelled.getId(), WorkInfo.State.CANCELLED);
        assertEquals("", MobileTaskRegistryStore.workId(app, "recommendation", NativeRecommendationJobs.UNIQUE_NAME));

        OneTimeWorkRequest recommendation = delayed(NativeRecommendationWorker.class);
        enqueueUnique(manager, NativeRecommendationJobs.UNIQUE_NAME, recommendation);
        MobileTaskRegistryStore.setWorkId(app, "recommendation", NativeRecommendationJobs.UNIQUE_NAME, recommendation.getId());
        awaitState(manager, recommendation.getId(), WorkInfo.State.ENQUEUED);

        OneTimeWorkRequest picaActive = delayedPica(PICA_ACTIVE_COMIC);
        enqueueUnique(manager, PicaDownloadJobs.name(PICA_ACTIVE_COMIC, ""), picaActive);
        MobileTaskRegistryStore.registerDownload(app, "pica", PICA_ACTIVE_COMIC, "", picaActive.getId());
        awaitState(manager, picaActive.getId(), WorkInfo.State.ENQUEUED);

        OneTimeWorkRequest picaCancelled = delayedPica(PICA_CANCELLED_COMIC);
        enqueueUnique(manager, PicaDownloadJobs.name(PICA_CANCELLED_COMIC, ""), picaCancelled);
        MobileTaskRegistryStore.registerDownload(app, "pica", PICA_CANCELLED_COMIC, "", picaCancelled.getId());
        PicaDownloadJobs.cancel(app, PICA_CANCELLED_COMIC, "");
        awaitState(manager, picaCancelled.getId(), WorkInfo.State.CANCELLED);
        assertNull(downloadRef(app, "pica", PICA_CANCELLED_COMIC, ""));

        OneTimeWorkRequest ehPaused = delayedEh(EH_PAUSED_COMIC);
        enqueueUnique(manager, EhDownloadJobs.name(EH_PAUSED_COMIC), ehPaused);
        MobileTaskRegistryStore.registerDownload(app, "eh", EH_PAUSED_COMIC, "", ehPaused.getId());
        EhDownloadJobs.pause(app, EH_PAUSED_COMIC);
        awaitState(manager, ehPaused.getId(), WorkInfo.State.CANCELLED);
        assertTrue(EhDownloadJobs.paused(app, EH_PAUSED_COMIC));
        assertNotNull(downloadRef(app, "eh", EH_PAUSED_COMIC, ""));

        boolean committed = app.getSharedPreferences(HARNESS_PREFS, Context.MODE_PRIVATE).edit()
            .putInt(KEY_SEED_PID, Process.myPid())
            .putString(KEY_FAVORITE, favorite.getId().toString())
            .putString(KEY_BOOTSTRAP, bootstrap.getId().toString())
            .putString(KEY_RECOMMENDATION, recommendation.getId().toString())
            .putString(KEY_PICA_ACTIVE, picaActive.getId().toString())
            .putString(KEY_EH_PAUSED, ehPaused.getId().toString())
            .putString(KEY_PICA_CANCELLED, picaCancelled.getId().toString())
            .commit();
        assertTrue(committed);

        // Force both production preference files through a synchronous disk commit before adb
        // force-stop. The extra keys are ignored by production readers.
        assertTrue(app.getSharedPreferences("background-task-registry-v1", Context.MODE_PRIVATE)
            .edit().putLong("g14-flush", System.nanoTime()).commit());
        assertTrue(app.getSharedPreferences("background-task-pauses-v1", Context.MODE_PRIVATE)
            .edit().putLong("g14-flush", System.nanoTime()).commit());
    }

    @Test public void verifyDurableRecoveryStateAfterForceStop() throws Exception {
        Context app = app();
        int seedPid = app.getSharedPreferences(HARNESS_PREFS, Context.MODE_PRIVATE).getInt(KEY_SEED_PID, -1);
        assertTrue("seed process id must exist", seedPid > 0);
        assertNotEquals("verification must run in a fresh process", seedPid, Process.myPid());

        WorkManager manager = WorkManager.getInstance(app);

        UUID favoriteId = storedUuid(app, KEY_FAVORITE);
        UUID bootstrapId = storedUuid(app, KEY_BOOTSTRAP);
        UUID recommendationId = storedUuid(app, KEY_RECOMMENDATION);
        UUID picaActiveId = storedUuid(app, KEY_PICA_ACTIVE);
        UUID ehPausedId = storedUuid(app, KEY_EH_PAUSED);
        UUID picaCancelledId = storedUuid(app, KEY_PICA_CANCELLED);

        assertEquals(favoriteId.toString(), MobileTaskRegistryStore.workId(app, "favorite-import", FavoriteImportJobs.UNIQUE_NAME));
        assertTrue(FavoriteImportJobs.paused(app));
        assertEquals(WorkInfo.State.CANCELLED, workInfo(manager, favoriteId).getState());

        assertEquals(bootstrapId.toString(), MobileTaskRegistryStore.workId(app, "pica-bootstrap", PicaBootstrapJobs.UNIQUE_NAME));
        assertEquals(WorkInfo.State.ENQUEUED, workInfo(manager, bootstrapId).getState());

        assertEquals(recommendationId.toString(), MobileTaskRegistryStore.workId(app, "recommendation", NativeRecommendationJobs.UNIQUE_NAME));
        assertEquals(WorkInfo.State.ENQUEUED, workInfo(manager, recommendationId).getState());

        MobileTaskRegistryStore.DownloadRef picaActive = downloadRef(app, "pica", PICA_ACTIVE_COMIC, "");
        assertNotNull(picaActive);
        assertEquals(picaActiveId.toString(), picaActive.workId);
        assertEquals(WorkInfo.State.ENQUEUED, workInfo(manager, picaActiveId).getState());

        MobileTaskRegistryStore.DownloadRef ehPaused = downloadRef(app, "eh", EH_PAUSED_COMIC, "");
        assertNotNull(ehPaused);
        assertEquals(ehPausedId.toString(), ehPaused.workId);
        assertTrue(EhDownloadJobs.paused(app, EH_PAUSED_COMIC));
        assertEquals(WorkInfo.State.CANCELLED, workInfo(manager, ehPausedId).getState());

        assertNull("explicitly cancelled download must not be registered", downloadRef(app, "pica", PICA_CANCELLED_COMIC, ""));
        assertFalse(PicaDownloadJobs.paused(app, PICA_CANCELLED_COMIC, ""));
        assertEquals(WorkInfo.State.CANCELLED, workInfo(manager, picaCancelledId).getState());

        String taskCenterText = awaitTaskCenterText();
        assertEquals("active Pica download must reconstruct exactly once", 1, occurrences(taskCenterText, PICA_ACTIVE_COMIC));
        assertEquals("paused E-H download must reconstruct exactly once", 1, occurrences(taskCenterText, EH_PAUSED_COMIC));
        assertEquals("explicitly cancelled download history must not resurrect", 0, occurrences(taskCenterText, PICA_CANCELLED_COMIC));
    }

    private static void verifyTerminalIdentityCleanup(Context app) {
        MobileTaskRegistryStore.setWorkId(app, "favorite-import", FavoriteImportJobs.UNIQUE_NAME, UUID.randomUUID());
        FavoriteImportJobs.complete(app);
        assertEquals("", MobileTaskRegistryStore.workId(app, "favorite-import", FavoriteImportJobs.UNIQUE_NAME));

        MobileTaskRegistryStore.setWorkId(app, "pica-bootstrap", PicaBootstrapJobs.UNIQUE_NAME, UUID.randomUUID());
        PicaBootstrapJobs.complete(app);
        assertEquals("", MobileTaskRegistryStore.workId(app, "pica-bootstrap", PicaBootstrapJobs.UNIQUE_NAME));

        MobileTaskRegistryStore.setWorkId(app, "recommendation", NativeRecommendationJobs.UNIQUE_NAME, UUID.randomUUID());
        NativeRecommendationJobs.complete(app);
        assertEquals("", MobileTaskRegistryStore.workId(app, "recommendation", NativeRecommendationJobs.UNIQUE_NAME));

        MobileTaskRegistryStore.registerDownload(app, "pica", "g14complete", "", UUID.randomUUID());
        PicaDownloadJobs.complete(app, "g14complete", "");
        assertNull(downloadRef(app, "pica", "g14complete", ""));
    }

    private static OneTimeWorkRequest delayedFavorite() {
        return new OneTimeWorkRequest.Builder(FavoriteImportWorker.class)
            .setInitialDelay(1, TimeUnit.DAYS)
            .setInputData(new Data.Builder().putBoolean(FavoriteImportWorker.KEY_COVERS, false).build())
            .addTag(FavoriteImportJobs.UNIQUE_NAME)
            .build();
    }

    private static OneTimeWorkRequest delayedPica(String comicId) {
        return new OneTimeWorkRequest.Builder(PicaDownloadWorker.class)
            .setInitialDelay(1, TimeUnit.DAYS)
            .setInputData(new Data.Builder()
                .putString(PicaDownloadWorker.KEY_COMIC, comicId)
                .putString(PicaDownloadWorker.KEY_EPISODE, "")
                .build())
            .addTag("pica-download")
            .addTag("comic:" + comicId)
            .addTag("episode:ALL")
            .build();
    }

    private static OneTimeWorkRequest delayedEh(String comicId) {
        return new OneTimeWorkRequest.Builder(EhDownloadWorker.class)
            .setInitialDelay(1, TimeUnit.DAYS)
            .setInputData(new Data.Builder().putString(EhDownloadWorker.KEY_COMIC, comicId).build())
            .addTag("eh-download")
            .addTag("comic:" + comicId)
            .build();
    }

    private static OneTimeWorkRequest delayed(Class<? extends androidx.work.ListenableWorker> worker) {
        return new OneTimeWorkRequest.Builder(worker)
            .setInitialDelay(1, TimeUnit.DAYS)
            .build();
    }

    private static void enqueueUnique(WorkManager manager, String name, OneTimeWorkRequest request) throws Exception {
        manager.enqueueUniqueWork(name, ExistingWorkPolicy.REPLACE, request)
            .getResult().get(10, TimeUnit.SECONDS);
    }

    private static WorkInfo workInfo(WorkManager manager, UUID id) throws Exception {
        WorkInfo value = manager.getWorkInfoById(id).get(10, TimeUnit.SECONDS);
        assertNotNull("missing WorkInfo for " + id, value);
        return value;
    }

    private static void awaitState(WorkManager manager, UUID id, WorkInfo.State expected) throws Exception {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(10);
        WorkInfo value = null;
        while (System.nanoTime() < deadline) {
            value = manager.getWorkInfoById(id).get(10, TimeUnit.SECONDS);
            if (value != null && value.getState() == expected) return;
            Thread.sleep(100L);
        }
        fail("WorkInfo " + id + " expected " + expected + " but was " + (value == null ? "null" : value.getState()));
    }

    private static UUID storedUuid(Context app, String key) {
        String value = app.getSharedPreferences(HARNESS_PREFS, Context.MODE_PRIVATE).getString(key, "");
        assertNotNull(value);
        assertFalse("missing stored UUID for " + key, value.isEmpty());
        return UUID.fromString(value);
    }

    private static MobileTaskRegistryStore.DownloadRef downloadRef(Context app, String provider, String comicId, String episodeId) {
        for (MobileTaskRegistryStore.DownloadRef ref : MobileTaskRegistryStore.downloads(app)) {
            if (provider.equals(ref.provider) && comicId.equals(ref.comicId) && episodeId.equals(ref.episodeId)) return ref;
        }
        return null;
    }

    private String awaitTaskCenterText() throws Exception {
        AtomicReference<String> text = new AtomicReference<>("");
        try (ActivityScenario<TaskCenterActivity> scenario = ActivityScenario.launch(TaskCenterActivity.class)) {
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(12);
            while (System.nanoTime() < deadline) {
                scenario.onActivity(activity -> text.set(collectText(activity.findViewById(android.R.id.content))));
                String current = text.get();
                if (current.contains(PICA_ACTIVE_COMIC) && current.contains(EH_PAUSED_COMIC)) return current;
                Thread.sleep(200L);
            }
        }
        fail("Task Center did not reconstruct expected downloads. UI=" + text.get());
        return text.get();
    }

    private static String collectText(View view) {
        if (view == null) return "";
        StringBuilder out = new StringBuilder();
        collectText(view, out);
        return out.toString();
    }

    private static void collectText(View view, StringBuilder out) {
        if (view instanceof TextView) {
            CharSequence value = ((TextView) view).getText();
            if (value != null) out.append(value).append('\n');
        }
        if (view instanceof ViewGroup) {
            ViewGroup group = (ViewGroup) view;
            for (int i = 0; i < group.getChildCount(); i++) collectText(group.getChildAt(i), out);
        }
    }

    private static int occurrences(String text, String needle) {
        int count = 0, index = 0;
        while ((index = text.indexOf(needle, index)) >= 0) {
            count++;
            index += needle.length();
        }
        return count;
    }
}
