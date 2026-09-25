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
import androidx.work.WorkInfo;
import androidx.work.WorkManager;

import org.junit.Test;
import org.junit.runner.RunWith;

import java.util.UUID;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Final P2-G15 verification after the host has already:
 * 1) seeded real WorkManager state from WorkerForceStopSeedActivity,
 * 2) force-stopped that normal app process,
 * 3) relaunched the normal app,
 * 4) observed WorkerRecoveryProbeWorker execute again.
 *
 * Instrumentation is deliberately verification-only because Android starts/stops an instrumentation
 * target with its own force-stop lifecycle. Keeping seed work out of instrumentation makes the
 * measured host force-stop boundary unambiguous.
 */
@RunWith(AndroidJUnit4.class)
public final class WorkerForceStopRecoveryTest {
    private Context app() {
        return InstrumentationRegistry.getInstrumentation()
            .getTargetContext().getApplicationContext();
    }

    @Test public void verifyDurableRecoveryStateAfterForceStop() throws Exception {
        Context app = app();
        int seedPid = app.getSharedPreferences(
            WorkerForceStopSeedActivity.HARNESS_PREFS, Context.MODE_PRIVATE
        ).getInt(WorkerForceStopSeedActivity.KEY_SEED_PID, -1);
        assertTrue("seed process id must exist", seedPid > 0);
        assertNotEquals(
            "verification must run in a fresh process",
            seedPid,
            Process.myPid()
        );

        WorkManager manager = WorkManager.getInstance(app);

        UUID favoriteId = storedUuid(app, WorkerForceStopSeedActivity.KEY_FAVORITE);
        UUID bootstrapId = storedUuid(app, WorkerForceStopSeedActivity.KEY_BOOTSTRAP);
        UUID recommendationId = storedUuid(
            app, WorkerForceStopSeedActivity.KEY_RECOMMENDATION
        );
        UUID picaActiveId = storedUuid(app, WorkerForceStopSeedActivity.KEY_PICA_ACTIVE);
        UUID ehPausedId = storedUuid(app, WorkerForceStopSeedActivity.KEY_EH_PAUSED);
        UUID picaCancelledId = storedUuid(
            app, WorkerForceStopSeedActivity.KEY_PICA_CANCELLED
        );
        UUID probeId = storedUuid(app, WorkerForceStopSeedActivity.KEY_PROBE);

        assertEquals(
            favoriteId.toString(),
            MobileTaskRegistryStore.workId(
                app, "favorite-import", FavoriteImportJobs.UNIQUE_NAME
            )
        );
        assertTrue(FavoriteImportJobs.paused(app));
        assertEquals(
            WorkInfo.State.CANCELLED,
            workInfo(manager, favoriteId).getState()
        );

        assertEquals(
            bootstrapId.toString(),
            MobileTaskRegistryStore.workId(
                app, "pica-bootstrap", PicaBootstrapJobs.UNIQUE_NAME
            )
        );
        assertEquals(
            WorkInfo.State.ENQUEUED,
            workInfo(manager, bootstrapId).getState()
        );

        assertEquals(
            recommendationId.toString(),
            MobileTaskRegistryStore.workId(
                app, "recommendation", NativeRecommendationJobs.UNIQUE_NAME
            )
        );
        assertEquals(
            WorkInfo.State.ENQUEUED,
            workInfo(manager, recommendationId).getState()
        );

        MobileTaskRegistryStore.DownloadRef picaActive = downloadRef(
            app, "pica", WorkerForceStopSeedActivity.PICA_ACTIVE_COMIC, ""
        );
        assertNotNull(picaActive);
        assertEquals(picaActiveId.toString(), picaActive.workId);
        assertEquals(
            WorkInfo.State.ENQUEUED,
            workInfo(manager, picaActiveId).getState()
        );

        MobileTaskRegistryStore.DownloadRef ehPaused = downloadRef(
            app, "eh", WorkerForceStopSeedActivity.EH_PAUSED_COMIC, ""
        );
        assertNotNull(ehPaused);
        assertEquals(ehPausedId.toString(), ehPaused.workId);
        assertTrue(
            EhDownloadJobs.paused(app, WorkerForceStopSeedActivity.EH_PAUSED_COMIC)
        );
        assertEquals(
            WorkInfo.State.CANCELLED,
            workInfo(manager, ehPausedId).getState()
        );

        assertNull(
            "explicitly cancelled download must not be registered",
            downloadRef(
                app, "pica", WorkerForceStopSeedActivity.PICA_CANCELLED_COMIC, ""
            )
        );
        assertFalse(
            PicaDownloadJobs.paused(
                app, WorkerForceStopSeedActivity.PICA_CANCELLED_COMIC, ""
            )
        );
        assertEquals(
            WorkInfo.State.CANCELLED,
            workInfo(manager, picaCancelledId).getState()
        );

        awaitProbeRuns(app, 2);
        WorkInfo probeInfo = workInfo(manager, probeId);
        assertFalse(
            "force-stopped RUNNING work must remain unfinished after reconstruction",
            probeInfo.getState().isFinished()
        );

        String taskCenterText = awaitTaskCenterText();
        assertEquals(
            "active Pica download must reconstruct exactly once",
            1,
            occurrences(
                taskCenterText, WorkerForceStopSeedActivity.PICA_ACTIVE_COMIC
            )
        );
        assertEquals(
            "paused E-H download must reconstruct exactly once",
            1,
            occurrences(
                taskCenterText, WorkerForceStopSeedActivity.EH_PAUSED_COMIC
            )
        );
        assertEquals(
            "explicitly cancelled download history must not resurrect",
            0,
            occurrences(
                taskCenterText, WorkerForceStopSeedActivity.PICA_CANCELLED_COMIC
            )
        );

        manager.cancelUniqueWork(WorkerRecoveryProbeWorker.UNIQUE_NAME)
            .getResult().get(10, TimeUnit.SECONDS);
        awaitState(manager, probeId, WorkInfo.State.CANCELLED);
    }

    private static WorkInfo workInfo(WorkManager manager, UUID id) throws Exception {
        WorkInfo value = manager.getWorkInfoById(id).get(10, TimeUnit.SECONDS);
        assertNotNull("missing WorkInfo for " + id, value);
        return value;
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
        fail(
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
        fail("probe expected runCount >= " + expected + " but was " + observed);
    }

    private static UUID storedUuid(Context app, String key) {
        String value = app.getSharedPreferences(
            WorkerForceStopSeedActivity.HARNESS_PREFS, Context.MODE_PRIVATE
        ).getString(key, "");
        assertNotNull(value);
        assertFalse("missing stored UUID for " + key, value.isEmpty());
        return UUID.fromString(value);
    }

    private static MobileTaskRegistryStore.DownloadRef downloadRef(
        Context app, String provider, String comicId, String episodeId
    ) {
        return WorkerForceStopSeedActivity.downloadRef(
            app, provider, comicId, episodeId
        );
    }

    private String awaitTaskCenterText() throws Exception {
        AtomicReference<String> text = new AtomicReference<>("");
        try (
            ActivityScenario<TaskCenterActivity> scenario =
                ActivityScenario.launch(TaskCenterActivity.class)
        ) {
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(12);
            while (System.nanoTime() < deadline) {
                scenario.onActivity(
                    activity -> text.set(
                        collectText(activity.findViewById(android.R.id.content))
                    )
                );
                String current = text.get();
                if (
                    current.contains(WorkerForceStopSeedActivity.PICA_ACTIVE_COMIC) &&
                    current.contains(WorkerForceStopSeedActivity.EH_PAUSED_COMIC)
                ) return current;
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
            for (int i = 0; i < group.getChildCount(); i++) {
                collectText(group.getChildAt(i), out);
            }
        }
    }

    private static int occurrences(String text, String needle) {
        int count = 0;
        int index = 0;
        while ((index = text.indexOf(needle, index)) >= 0) {
            count++;
            index += needle.length();
        }
        return count;
    }
}
