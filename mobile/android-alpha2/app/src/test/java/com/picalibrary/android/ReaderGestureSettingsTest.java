package com.picalibrary.android;

import static org.junit.Assert.*;

import android.content.Context;
import java.util.HashMap;
import java.util.Map;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 35, manifest = Config.NONE)
public class ReaderGestureSettingsTest {
    private Context context;

    @Before public void reset() {
        context = RuntimeEnvironment.getApplication();
        context.getSharedPreferences("reader-gestures-v1", Context.MODE_PRIVATE).edit().clear().commit();
    }

    @Test public void defaultMatchesExistingReader() {
        ReaderGestureSettings.Snapshot settings = ReaderGestureSettings.local(context);
        assertTrue(settings.doubleTapEnabled);
        assertEquals(2f, settings.doubleTapScale(), 0f);
    }

    @Test public void preferencesSurviveReload() {
        ReaderGestureSettings.save(context, false, 300);
        ReaderGestureSettings.Snapshot reloaded = ReaderGestureSettings.local(context);
        assertFalse(reloaded.doubleTapEnabled);
        assertEquals(3f, reloaded.doubleTapScale(), 0f);
    }

    @Test public void supportedZoomLevelsArePreserved() {
        for (int percent : new int[]{150, 200, 300}) {
            ReaderGestureSettings.save(context, true, percent);
            assertEquals(percent, ReaderGestureSettings.local(context).zoomPercent);
        }
    }

    @Test public void unsupportedStoredValueFallsBackWithoutRewritingPreferences() {
        context.getSharedPreferences("reader-gestures-v1", Context.MODE_PRIVATE)
                .edit().putInt("zoomPercent", 999).commit();
        assertEquals(200, ReaderGestureSettings.local(context).zoomPercent);
        assertEquals(999, context.getSharedPreferences("reader-gestures-v1", Context.MODE_PRIVATE)
                .getInt("zoomPercent", 0));
    }

    @Test public void changingGesturesDoesNotChangePortableSettingsOrTimestamp() {
        context.getSharedPreferences("reader-display", Context.MODE_PRIVATE).edit()
                .putInt("mode", 2).putBoolean("keepOn", false)
                .putString("portableUpdatedAt", "2026-10-01T00:00:00Z").commit();
        Map<String, ?> before = new HashMap<>(context.getSharedPreferences("reader-display", Context.MODE_PRIVATE).getAll());
        ReaderGestureSettings.save(context, false, 150);
        assertEquals(before, context.getSharedPreferences("reader-display", Context.MODE_PRIVATE).getAll());
    }
}
