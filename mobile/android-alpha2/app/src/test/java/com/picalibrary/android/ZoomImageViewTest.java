package com.picalibrary.android;

import static org.junit.Assert.*;
import static org.robolectric.Shadows.shadowOf;

import android.app.Activity;
import android.graphics.Bitmap;
import android.graphics.Matrix;
import android.graphics.drawable.BitmapDrawable;
import android.os.Looper;
import android.os.SystemClock;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewConfiguration;
import java.time.Duration;
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
public class ZoomImageViewTest {
    private ActivityController<Activity> controller;
    private ZoomImageView image;
    private float fittedScale;
    private int previous, next, center;

    @Before public void setup() {
        controller = Robolectric.buildActivity(Activity.class).setup();
        image = new ZoomImageView(controller.get());
        controller.get().setContentView(image);
        image.measure(View.MeasureSpec.makeMeasureSpec(400, View.MeasureSpec.EXACTLY),
                View.MeasureSpec.makeMeasureSpec(600, View.MeasureSpec.EXACTLY));
        image.layout(0, 0, 400, 600);
        image.setImageDrawable(new BitmapDrawable(image.getResources(), Bitmap.createBitmap(400, 600, Bitmap.Config.ARGB_8888)));
        shadowOf(Looper.getMainLooper()).idle();
        image.resetZoom();
        fittedScale = matrixScale();
        assertTrue("The image must be fitted before exercising gestures", fittedScale > 0f);
        image.setNavigationListener(new ZoomImageView.NavigationListener() {
            public void onPrevious() { previous++; }
            public void onNext() { next++; }
            public void onCenterTap() { center++; }
        });
    }

    @After public void teardown() { controller.pause().stop().destroy(); }

    @Test public void defaultDoubleTapZoomsWithoutTurningPage() {
        doubleTap(350, 300);
        settle();
        assertEquals(2f, scale(), .001f);
        assertNoNavigation();
        doubleTap(350, 300);
        settle();
        assertEquals(1f, scale(), .001f);
        assertNoNavigation();
    }

    @Test public void configuredZoomLevelsAreUsed() {
        for (int percent : new int[]{150, 200, 300}) {
            image.resetZoom();
            image.setGestureSettings(new ReaderGestureSettings.Snapshot(true, percent));
            doubleTap(200, 300);
            settle();
            assertEquals(percent / 100f, scale(), .001f);
        }
        assertNoNavigation();
    }

    @Test public void enabledSingleTapWaitsForDoubleTapConfirmation() {
        tap(350, 300);
        assertEquals(0, next);
        settle();
        assertEquals(1, next);
        assertEquals(1f, scale(), .001f);
    }

    @Test public void disabledDoubleTapMakesEachTapImmediateAndNeverZooms() {
        image.setGestureSettings(new ReaderGestureSettings.Snapshot(false, 300));
        tap(350, 300);
        assertEquals(1, next);
        advance(80);
        tap(350, 300);
        assertEquals(2, next);
        settle();
        assertEquals(2, next);
        assertEquals(1f, scale(), .001f);
    }

    @Test public void settingsApplyWithoutResettingCurrentZoom() {
        doubleTap(200, 300);
        settle();
        image.setGestureSettings(new ReaderGestureSettings.Snapshot(true, 300));
        assertEquals(2f, scale(), .001f);
        doubleTap(200, 300);
        settle();
        assertEquals(1f, scale(), .001f);
        doubleTap(200, 300);
        settle();
        assertEquals(3f, scale(), .001f);
        assertNoNavigation();
    }

    @Test public void zoomedTapShowsControlsInsteadOfTurningPage() {
        doubleTap(200, 300);
        settle();
        image.setGestureSettings(new ReaderGestureSettings.Snapshot(false, 200));
        tap(350, 300);
        assertEquals(1, center);
        assertEquals(0, next);
        assertEquals(0, previous);
    }

    @Test public void disabledDoubleTapKeepsTapZones() {
        image.setGestureSettings(new ReaderGestureSettings.Snapshot(false, 200));
        tap(40, 300);
        settle();
        tap(200, 300);
        settle();
        tap(350, 300);
        assertEquals(1, previous);
        assertEquals(1, center);
        assertEquals(1, next);
    }

    @Test public void reenablingDoubleTapRestoresZoomWithoutExtraTap() {
        image.setGestureSettings(new ReaderGestureSettings.Snapshot(false, 200));
        tap(350, 300);
        settle();
        image.setGestureSettings(new ReaderGestureSettings.Snapshot(true, 150));
        doubleTap(350, 300);
        settle();
        assertEquals(1, next);
        assertEquals(1.5f, scale(), .001f);
    }

    @Test public void pinchStillWorksWithDoubleTapDisabledAndDoesNotNavigate() {
        image.setGestureSettings(new ReaderGestureSettings.Snapshot(false, 200));
        long downTime = SystemClock.uptimeMillis();
        send(downTime, MotionEvent.ACTION_DOWN, 150, 250, 1);
        advance(30);
        send(downTime, MotionEvent.ACTION_POINTER_DOWN | (1 << MotionEvent.ACTION_POINTER_INDEX_SHIFT), 150, 250, 2);
        for (int spread : new int[]{75, 100, 125, 150, 175}) {
            advance(30);
            send(downTime, MotionEvent.ACTION_MOVE, 200 - spread, 200 + spread, 2);
        }
        advance(30);
        send(downTime, MotionEvent.ACTION_POINTER_UP | (1 << MotionEvent.ACTION_POINTER_INDEX_SHIFT), 25, 375, 2);
        advance(30);
        send(downTime, MotionEvent.ACTION_UP, 25, 375, 1);
        settle();
        assertTrue("Pinch should still enlarge the image", scale() > 1.1f);
        assertTrue(scale() <= 4.001f);
        assertNoNavigation();
    }

    private void doubleTap(float x, float y) { tap(x, y); advance(80); tap(x, y); }

    private void tap(float x, float y) {
        long down = SystemClock.uptimeMillis();
        MotionEvent start = MotionEvent.obtain(down, down, MotionEvent.ACTION_DOWN, x, y, 0);
        image.onTouchEvent(start); start.recycle();
        advance(50);
        MotionEvent end = MotionEvent.obtain(down, SystemClock.uptimeMillis(), MotionEvent.ACTION_UP, x, y, 0);
        image.onTouchEvent(end); end.recycle();
    }

    private void send(long down, int action, float x0, float x1, int count) {
        MotionEvent.PointerProperties[] properties = new MotionEvent.PointerProperties[count];
        MotionEvent.PointerCoords[] coords = new MotionEvent.PointerCoords[count];
        for (int i = 0; i < count; i++) {
            properties[i] = new MotionEvent.PointerProperties();
            properties[i].id = i; properties[i].toolType = MotionEvent.TOOL_TYPE_FINGER;
            coords[i] = new MotionEvent.PointerCoords();
            coords[i].x = i == 0 ? x0 : x1; coords[i].y = 300;
            coords[i].pressure = 1; coords[i].size = 1;
        }
        MotionEvent event = MotionEvent.obtain(down, SystemClock.uptimeMillis(), action, count,
                properties, coords, 0, 0, 1, 1, 0, 0, 0x1002, 0);
        image.onTouchEvent(event); event.recycle();
    }

    // Zoom is relative to fit-to-screen, which varies with the test window's actual insets/size.
    private float scale() { return matrixScale() / fittedScale; }
    private float matrixScale() { float[] values = new float[9]; image.getImageMatrix().getValues(values); return values[Matrix.MSCALE_X]; }
    private void advance(long millis) { shadowOf(Looper.getMainLooper()).idleFor(Duration.ofMillis(millis)); }
    private void settle() { advance(ViewConfiguration.getDoubleTapTimeout() + 20); }
    private void assertNoNavigation() { assertEquals(0, previous + next + center); }
}
