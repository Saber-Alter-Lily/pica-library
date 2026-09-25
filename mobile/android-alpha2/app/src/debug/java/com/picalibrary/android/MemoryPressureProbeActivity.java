package com.picalibrary.android;

import android.app.Activity;
import android.content.Context;
import android.graphics.Bitmap;
import android.os.Bundle;

import java.io.File;
import java.io.FileOutputStream;
import java.lang.reflect.Method;
import java.nio.charset.StandardCharsets;

/** Debug-only P2-G16 probe for Application.onTrimMemory bitmap-cache eviction. */
public final class MemoryPressureProbeActivity extends Activity {
    static final String EXTRA_ACTION = "action";
    static final String ACTION_PRIME = "prime";
    static final String ACTION_REPORT = "report";
    static final String BEFORE_FILE = "p2-g16-memory-before";
    static final String AFTER_FILE = "p2-g16-memory-after";

    @Override protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        String action = getIntent() == null ? "" :
            getIntent().getStringExtra(EXTRA_ACTION);
        try {
            if (ACTION_PRIME.equals(action)) prime();
            else if (ACTION_REPORT.equals(action)) report();
            else throw new IllegalArgumentException("unknown action");
            finish();
        } catch (Throwable error) {
            try {
                write(
                    ACTION_PRIME.equals(action) ? BEFORE_FILE : AFTER_FILE,
                    "ERROR " + error.getClass().getName() + ": " +
                        (error.getMessage() == null ? "" : error.getMessage()) + "\n"
                );
            } catch (Exception ignored) {}
            finish();
        }
    }

    private void prime() throws Exception {
        CoverRepository.trimMemory();
        ImageRepository.trimMemory();
        Bitmap cover = Bitmap.createBitmap(512, 512, Bitmap.Config.ARGB_8888);
        Bitmap image = Bitmap.createBitmap(512, 512, Bitmap.Config.ARGB_8888);
        Method remember = CoverRepository.class.getDeclaredMethod(
            "remember", String.class, Bitmap.class
        );
        remember.setAccessible(true);
        remember.invoke(null, "p2-g16-memory-cover", cover);
        ImageRepository.put("p2-g16-memory-image", image);
        write(
            BEFORE_FILE,
            "pid=" + android.os.Process.myPid() +
                " cover=" + CoverRepository.memoryBytes() +
                " image=" + ImageRepository.memoryBytes() + "\n"
        );
    }

    private void report() throws Exception {
        write(
            AFTER_FILE,
            "pid=" + android.os.Process.myPid() +
                " cover=" + CoverRepository.memoryBytes() +
                " image=" + ImageRepository.memoryBytes() + "\n"
        );
    }

    private void write(String name, String value) throws Exception {
        File file = new File(getApplicationContext().getFilesDir(), name);
        try (FileOutputStream out = new FileOutputStream(file, false)) {
            out.write(value.getBytes(StandardCharsets.UTF_8));
            out.getFD().sync();
        }
    }
}
