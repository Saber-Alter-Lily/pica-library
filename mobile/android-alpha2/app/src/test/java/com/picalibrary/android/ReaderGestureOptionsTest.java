package com.picalibrary.android;

import static org.junit.Assert.*;
import static org.robolectric.Shadows.shadowOf;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Context;
import android.os.Looper;
import android.view.View;
import android.view.ViewGroup;
import android.widget.RadioButton;
import android.widget.RadioGroup;
import android.widget.ScrollView;
import android.widget.Switch;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.android.controller.ActivityController;
import org.robolectric.annotation.Config;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 35, manifest = Config.NONE)
public class ReaderGestureOptionsTest {
    private ActivityController<Activity> controller;
    private Activity activity;
    private AlertDialog dialog;
    private int changes, dismissals;

    @Before public void setup() {
        controller = Robolectric.buildActivity(Activity.class).setup();
        activity = controller.get();
        activity.getSharedPreferences("reader-gestures-v1", Context.MODE_PRIVATE).edit().clear().commit();
        LocaleStore.set(activity, LocaleStore.ZH_CN);
    }

    @After public void teardown() {
        if (dialog != null) dialog.dismiss();
        controller.pause().stop().destroy();
    }

    @Test public void openingPanelDoesNotWriteSettings() {
        show();
        assertTrue(find(Switch.class).isChecked());
        RadioGroup group = find(RadioGroup.class);
        assertEquals(200, ((RadioButton) group.findViewById(group.getCheckedRadioButtonId())).getTag());
        assertEquals(0, changes);
        assertTrue(activity.getSharedPreferences("reader-gestures-v1", Context.MODE_PRIVATE).getAll().isEmpty());
        assertNotNull(find(ScrollView.class));
    }

    @Test public void toggleAppliesImmediatelyAndKeepsChosenZoomLevel() {
        ReaderGestureSettings.save(activity, true, 300);
        show();
        find(Switch.class).performClick();
        assertFalse(ReaderGestureSettings.local(activity).doubleTapEnabled);
        assertEquals(300, ReaderGestureSettings.local(activity).zoomPercent);
        assertEquals(1, changes);
        RadioGroup levels = find(RadioGroup.class);
        for (int i = 0; i < levels.getChildCount(); i++) assertFalse(levels.getChildAt(i).isEnabled());
        find(Switch.class).performClick();
        assertTrue(ReaderGestureSettings.local(activity).doubleTapEnabled);
        assertEquals(300, ReaderGestureSettings.local(activity).zoomPercent);
        for (int i = 0; i < levels.getChildCount(); i++) assertTrue(levels.getChildAt(i).isEnabled());
        assertEquals(2, changes);
    }

    @Test public void choosingZoomLevelSavesAndNotifiesOnce() {
        show();
        RadioGroup levels = find(RadioGroup.class);
        levels.getChildAt(0).performClick();
        assertEquals(150, ReaderGestureSettings.local(activity).zoomPercent);
        assertEquals(1, changes);
        dialog.dismiss();
        shadowOf(Looper.getMainLooper()).idle();
        assertEquals(1, dismissals);
    }

    @Test public void titleFollowsAppLanguage() {
        assertEquals("手势与放大（仅此手机）", ReaderGestureOptions.title(activity));
        LocaleStore.set(activity, LocaleStore.EN);
        assertEquals("Gestures & zoom (this phone)", ReaderGestureOptions.title(activity));
        LocaleStore.set(activity, LocaleStore.JA);
        assertEquals("ジェスチャーと拡大（この端末のみ）", ReaderGestureOptions.title(activity));
    }

    private void show() { dialog = ReaderGestureOptions.show(activity, () -> changes++, () -> dismissals++); }
    private <T extends View> T find(Class<T> type) {
        T result = find(dialog.getWindow().getDecorView(), type);
        assertNotNull(type.getSimpleName() + " missing from options panel", result);
        return result;
    }
    private <T extends View> T find(View view, Class<T> type) {
        if (type.isInstance(view)) return type.cast(view);
        if (view instanceof ViewGroup) {
            ViewGroup group = (ViewGroup) view;
            for (int i = 0; i < group.getChildCount(); i++) {
                T result = find(group.getChildAt(i), type);
                if (result != null) return result;
            }
        }
        return null;
    }
}
