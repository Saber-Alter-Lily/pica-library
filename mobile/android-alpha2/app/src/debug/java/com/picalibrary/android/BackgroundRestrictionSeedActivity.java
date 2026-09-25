package com.picalibrary.android;

import android.app.Activity;
import android.content.Context;
import android.os.Bundle;
import android.widget.TextView;

import androidx.work.Constraints;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.WorkManager;

import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

/** Debug-only seed surface for the P2-G16 Doze/background-restriction acceptance. */
public final class BackgroundRestrictionSeedActivity extends Activity {
    static final String READY_FILE = "p2-g16-background-ready";
    static final String FAILURE_FILE = "p2-g16-background-failure";
    static final String KEY_WORK_ID = "workId";
    private final ExecutorService worker = Executors.newSingleThreadExecutor();

    @Override protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        TextView status = new TextView(this);
        status.setPadding(32, 32, 32, 32);
        status.setText("P2-G16 background restriction seed: preparing");
        setContentView(status);
        worker.execute(() -> {
            try {
                seed();
                runOnUiThread(() -> {
                    status.setText("P2-G16 background restriction seed: READY");
                    finish();
                });
            } catch (Throwable error) {
                writeFile(
                    FAILURE_FILE,
                    error.getClass().getName() + ": " +
                        (error.getMessage() == null ? "" : error.getMessage()) + "\n"
                );
                runOnUiThread(() ->
                    status.setText("P2-G16 background restriction seed: FAILED")
                );
            }
        });
    }

    private void seed() throws Exception {
        Context app = getApplicationContext();
        WorkManager manager = WorkManager.getInstance(app);
        manager.cancelUniqueWork(BackgroundRestrictionProbeWorker.UNIQUE_NAME)
            .getResult().get(10, TimeUnit.SECONDS);
        new File(app.getFilesDir(), READY_FILE).delete();
        new File(app.getFilesDir(), FAILURE_FILE).delete();
        new File(app.getFilesDir(), BackgroundRestrictionProbeWorker.RUN_COUNT_FILE).delete();
        app.getSharedPreferences(
            BackgroundRestrictionProbeWorker.PREFS,
            Context.MODE_PRIVATE
        ).edit().clear().commit();

        Constraints constraints = new Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build();
        OneTimeWorkRequest request =
            new OneTimeWorkRequest.Builder(BackgroundRestrictionProbeWorker.class)
                .setInitialDelay(15, TimeUnit.SECONDS)
                .setConstraints(constraints)
                .build();

        manager.enqueueUniqueWork(
            BackgroundRestrictionProbeWorker.UNIQUE_NAME,
            ExistingWorkPolicy.REPLACE,
            request
        ).getResult().get(10, TimeUnit.SECONDS);

        boolean committed = app.getSharedPreferences(
            BackgroundRestrictionProbeWorker.PREFS,
            Context.MODE_PRIVATE
        ).edit().putString(KEY_WORK_ID, request.getId().toString()).commit();
        if (!committed) throw new IllegalStateException("work id commit failed");

        writeFile(READY_FILE, "READY workId=" + request.getId() + "\n");
    }

    private void writeFile(String name, String value) throws Exception {
        File target = new File(getApplicationContext().getFilesDir(), name);
        try (FileOutputStream out = new FileOutputStream(target, false)) {
            out.write(value.getBytes(StandardCharsets.UTF_8));
            out.getFD().sync();
        }
    }

    @Override protected void onDestroy() {
        worker.shutdownNow();
        super.onDestroy();
    }
}
