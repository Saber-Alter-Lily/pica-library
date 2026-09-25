package com.picalibrary.android;

import android.content.Context;

import androidx.annotation.NonNull;
import androidx.work.Data;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;

/** Debug-only P2-G16 probe for real Doze/background scheduling behavior. */
public final class BackgroundRestrictionProbeWorker extends Worker {
    static final String UNIQUE_NAME = "p2-g16-background-restriction-probe";
    static final String PREFS = "p2-g16-background-restriction";
    static final String KEY_RUN_COUNT = "runCount";
    static final String RUN_COUNT_FILE = "p2-g16-background-run-count";

    public BackgroundRestrictionProbeWorker(
        @NonNull Context context,
        @NonNull WorkerParameters params
    ) {
        super(context, params);
    }

    @NonNull @Override public Result doWork() {
        Context app = getApplicationContext();
        int count = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getInt(KEY_RUN_COUNT, 0) + 1;
        if (!app.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit().putInt(KEY_RUN_COUNT, count).commit()) {
            return Result.failure(new Data.Builder()
                .putString("phase", "run-count commit failed")
                .build());
        }
        File marker = new File(app.getFilesDir(), RUN_COUNT_FILE);
        try (FileOutputStream out = new FileOutputStream(marker, false)) {
            out.write((Integer.toString(count) + "\n").getBytes(StandardCharsets.UTF_8));
            out.getFD().sync();
        } catch (Exception error) {
            return Result.failure(new Data.Builder()
                .putString("phase", "run-count marker failed")
                .build());
        }
        return Result.success(new Data.Builder()
            .putInt(KEY_RUN_COUNT, count)
            .putString("phase", "executed")
            .build());
    }
}
