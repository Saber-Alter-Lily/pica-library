package com.picalibrary.android;

import android.content.Context;
import android.content.SharedPreferences;
import com.picalibrary.android.reader.gestures.ReaderGesturePolicy;

/** Phone-local gestures, deliberately separate from portable reader settings. */
final class ReaderGestureSettings {
    private static final String PREFS = "reader-gestures-v1";

    static final class Snapshot {
        final boolean doubleTapEnabled;
        final int zoomPercent;

        Snapshot(boolean doubleTapEnabled, int zoomPercent) {
            this.doubleTapEnabled = doubleTapEnabled;
            this.zoomPercent = normalizeZoomPercent(zoomPercent);
        }

        float doubleTapScale() { return zoomPercent / 100f; }
    }

    private ReaderGestureSettings() {}

    static int normalizeZoomPercent(int value) {
        return ReaderGesturePolicy.normalizeZoomPercent(value);
    }

    static Snapshot local(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        return new Snapshot(prefs.getBoolean("doubleTapEnabled", true),
                prefs.getInt("zoomPercent", 200));
    }

    static Snapshot save(Context context, boolean doubleTapEnabled, int zoomPercent) {
        Snapshot settings = new Snapshot(doubleTapEnabled, zoomPercent);
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
                .putBoolean("doubleTapEnabled", settings.doubleTapEnabled)
                .putInt("zoomPercent", settings.zoomPercent).apply();
        return settings;
    }
}
