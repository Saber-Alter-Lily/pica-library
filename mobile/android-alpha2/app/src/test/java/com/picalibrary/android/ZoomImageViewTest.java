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
import android.widget.FrameLayout;
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
@Config(sdk = {28, 35}, manifest = Config.NONE)
public class ZoomImageViewTest {
    private ActivityController<Activity> controller;
    private ZoomImageView image;
    private TouchParent parent;
    private float fittedScale;
    private int previous, next, center;

    @Before public void setup() {
        controller = Robolectric.buildActivity(Activity.class).setup();
        image = new ZoomImageView(controller.get());
        parent = new TouchParent(controller.get());
        parent.addView(image, new FrameLayout.LayoutParams(400, 600));
        controller.get().setContentView(parent);
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

    @Test public void horizontalFlingNavigatesOnceButVerticalDominantFlingDoesNot() {
        swipe(350, 300, 50, 300);
        settle();
        assertEquals(1, next);
        swipe(50, 100, 170, 500);
        settle();
        assertEquals(1, next);
        assertEquals(0, previous + center);
    }

    @Test public void pagerManagedFlingIsNotDispatchedAgainByTheImage() {
        image.setPagerManaged(true);
        swipe(350, 300, 50, 300);
        settle();
        assertNoNavigation();
        tap(350, 300);
        settle();
        assertEquals(1, next);
    }

    @Test public void cancelledTouchDoesNotNavigateAndNextTouchStillWorks() {
        long down = SystemClock.uptimeMillis();
        event(down, MotionEvent.ACTION_DOWN, 350, 300);
        advance(50);
        event(down, MotionEvent.ACTION_CANCEL, 350, 300);
        settle();
        assertNoNavigation();
        tap(350, 300);
        settle();
        assertEquals(1, next);
    }

    @Test public void settingsChangeCancelsPendingSingleTapWithoutResettingZoom() {
        tap(350, 300);
        image.setGestureSettings(new ReaderGestureSettings.Snapshot(false, 300));
        settle();
        assertNoNavigation();
        tap(40, 300);
        assertEquals(1, previous);
    }

    @Test public void recycledImageAndDetachCancelDelayedPageTurns() {
        tap(350, 300);
        image.setImageDrawable(new BitmapDrawable(image.getResources(), Bitmap.createBitmap(400, 600, Bitmap.Config.ARGB_8888)));
        settle();
        assertNoNavigation();
        tap(350, 300);
        parent.removeView(image);
        settle();
        assertNoNavigation();
    }

    @Test public void zoomedPanIsConstrainedAndDoesNotTurnPages() {
        doubleTap(200, 300);
        settle();
        swipe(200, 300, 1200, 1400);
        settle();
        assertEquals(2f, scale(), .001f);
        assertNoNavigation();
        float[] values = new float[9];
        image.getImageMatrix().getValues(values);
        assertTrue(values[Matrix.MTRANS_X] <= .01f);
        assertTrue(values[Matrix.MTRANS_Y] <= .01f);
        assertFalse(parent.disallowed);
    }

    @Test public void pinchAtFitHoldsParentAfterFirstFingerLiftsAndReleasesOnCancel() {
        long down = SystemClock.uptimeMillis();
        send(down, MotionEvent.ACTION_DOWN, 150, 250, 1);
        send(down, MotionEvent.ACTION_POINTER_DOWN | (1 << MotionEvent.ACTION_POINTER_INDEX_SHIFT), 150, 250, 2);
        send(down, MotionEvent.ACTION_POINTER_UP | (1 << MotionEvent.ACTION_POINTER_INDEX_SHIFT), 150, 250, 2);
        event(down, MotionEvent.ACTION_MOVE, 160, 300);
        assertTrue(parent.disallowed);
        event(down, MotionEvent.ACTION_CANCEL, 160, 300);
        assertFalse(parent.disallowed);
        settle();
        assertNoNavigation();
    }

    @Test public void disabledDoubleTapAlsoDisablesAndroidQuickScale() {
        image.setGestureSettings(new ReaderGestureSettings.Snapshot(false, 200));
        tap(200, 300);
        advance(80);
        swipe(200, 300, 200, 550);
        settle();
        assertEquals(1f, scale(), .001f);
        assertEquals(1, center); // Only the first, completed tap.
        assertEquals(0, previous + next);
    }

    @Test public void realParentInterceptionCancelsChildButZoomedPanKeepsOwnership() {
        parent.interceptMoves = true;
        parentSwipe(350, 300, 50, 300);
        settle();
        assertTrue(parent.intercepted);
        assertNoNavigation();
        parent.intercepted = false;
        doubleTap(200, 300);
        settle();
        parentSwipe(350, 300, 50, 300);
        settle();
        assertFalse(parent.intercepted);
        assertFalse(parent.disallowed);
        assertNoNavigation();
    }

    private void swipe(float x0, float y0, float x1, float y1) {
        long down = SystemClock.uptimeMillis();
        event(down, MotionEvent.ACTION_DOWN, x0, y0);
        for (int i = 1; i <= 5; i++) {
            advance(20);
            event(down, MotionEvent.ACTION_MOVE, x0 + (x1 - x0) * i / 5, y0 + (y1 - y0) * i / 5);
        }
        advance(10);
        event(down, MotionEvent.ACTION_UP, x1, y1);
    }

    private void event(long down, int action, float x, float y) {
        MotionEvent event = MotionEvent.obtain(down, SystemClock.uptimeMillis(), action, x, y, 0);
        image.onTouchEvent(event); event.recycle();
    }

    private void parentSwipe(float x0, float y0, float x1, float y1) {
        long down = SystemClock.uptimeMillis();
        for (int action : new int[]{MotionEvent.ACTION_DOWN, MotionEvent.ACTION_MOVE, MotionEvent.ACTION_UP}) {
            advance(50);
            MotionEvent event = MotionEvent.obtain(down, SystemClock.uptimeMillis(), action,
                    action == MotionEvent.ACTION_DOWN ? x0 : x1, action == MotionEvent.ACTION_DOWN ? y0 : y1, 0);
            parent.dispatchTouchEvent(event); event.recycle();
        }
    }

    private static final class TouchParent extends FrameLayout {
        boolean disallowed, interceptMoves, intercepted;
        TouchParent(Activity context) { super(context); }
        @Override public void requestDisallowInterceptTouchEvent(boolean disallow) {
            disallowed = disallow;
            super.requestDisallowInterceptTouchEvent(disallow);
        }
        @Override public boolean onInterceptTouchEvent(MotionEvent event) {
            if (interceptMoves && event.getActionMasked() == MotionEvent.ACTION_MOVE) { intercepted = true; return true; }
            return false;
        }
        @Override public boolean onTouchEvent(MotionEvent event) { return true; }
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
