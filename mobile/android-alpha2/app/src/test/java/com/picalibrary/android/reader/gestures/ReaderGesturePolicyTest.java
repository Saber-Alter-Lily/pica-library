package com.picalibrary.android.reader.gestures;

import static com.picalibrary.android.reader.gestures.ReaderGesturePolicy.Navigation.*;
import static org.junit.Assert.*;
import org.junit.Test;

/** Runs on plain JUnit without Robolectric, an Android Context, network or persistence. */
public class ReaderGesturePolicyTest {
    @Test public void zoomSettingsKeepLegacyLevelsAndFallback() {
        for (int value : new int[]{150, 200, 300}) assertEquals(value, ReaderGesturePolicy.normalizeZoomPercent(value));
        for (int value : new int[]{0, -1, 100, 400, Integer.MAX_VALUE}) assertEquals(200, ReaderGesturePolicy.normalizeZoomPercent(value));
    }

    @Test public void doubleTapTogglesAgainstFitWithoutChangingConfiguredTarget() {
        assertEquals(3f, ReaderGesturePolicy.doubleTapTarget(1f, 300), 0f);
        assertEquals(1f, ReaderGesturePolicy.doubleTapTarget(1.5f, 300), 0f);
        assertEquals(2f, ReaderGesturePolicy.doubleTapTarget(1f, 999), 0f);
        assertEquals(1.5f, ReaderGesturePolicy.doubleTapTarget(Float.NaN, 150), 0f);
    }

    @Test public void pinchClampsAndRejectsNonFiniteOrNonPositiveFactors() {
        assertEquals(4f, ReaderGesturePolicy.pinchScale(3f, Float.MAX_VALUE), 0f);
        assertEquals(1f, ReaderGesturePolicy.pinchScale(2f, .1f), 0f);
        for (float factor : new float[]{0, -1, Float.NaN, Float.POSITIVE_INFINITY}) {
            assertEquals(2f, ReaderGesturePolicy.pinchScale(2f, factor), 0f);
        }
        assertEquals(1.5f, ReaderGesturePolicy.pinchScale(Float.NaN, 1.5f), 0f);
    }

    @Test public void physicalTapZonesRetainExactBoundaries() {
        assertEquals(LEFT, ReaderGesturePolicy.tap(27, 100, 1));
        assertEquals(CENTER, ReaderGesturePolicy.tap(28, 100, 1));
        assertEquals(CENTER, ReaderGesturePolicy.tap(72, 100, 1));
        assertEquals(RIGHT, ReaderGesturePolicy.tap(73, 100, 1));
    }

    @Test public void zoomedTapOnlyTogglesControlsAndInvalidGeometryDoesNothing() {
        assertEquals(CENTER, ReaderGesturePolicy.tap(0, 400, 1.04f));
        assertEquals(CENTER, ReaderGesturePolicy.tap(400, 400, 3));
        assertEquals(NONE, ReaderGesturePolicy.tap(10, 0, 1));
        assertEquals(NONE, ReaderGesturePolicy.tap(Float.NaN, 400, 1));
        assertEquals(NONE, ReaderGesturePolicy.tap(10, 400, Float.NaN));
    }

    @Test public void horizontalFlingDirectionsKeepPhysicalOrderForReaderToMapRtl() {
        assertEquals(RIGHT, fling(-100, 20, -800, 40));
        assertEquals(LEFT, fling(100, 20, 800, 40));
    }

    @Test public void verticalAndDiagonalFlingMustNotTurnPages() {
        assertEquals(NONE, fling(100, 150, 800, 1000));
        assertEquals(NONE, fling(100, 100, 800, 400));
        assertEquals(NONE, fling(100, 20, 800, 800));
    }

    @Test public void flingThresholdsAreInclusiveButShortOrSlowFlingIsRejected() {
        assertEquals(LEFT, fling(72, 0, 500, 0));
        assertEquals(NONE, fling(71, 0, 1000, 0));
        assertEquals(NONE, fling(100, 0, 499, 0));
    }

    @Test public void pagerAndZoomOwnMotionAndNonFiniteInputIsInert() {
        assertEquals(NONE, ReaderGesturePolicy.fling(true, 1, 400, 100, 0, 800, 0));
        assertEquals(NONE, ReaderGesturePolicy.fling(false, 2, 400, 100, 0, 800, 0));
        assertEquals(NONE, ReaderGesturePolicy.fling(false, 1, 0, 100, 0, 800, 0));
        assertEquals(NONE, fling(100, Float.NaN, 800, 0));
    }

    @Test public void multiTouchRetainsOwnershipUntilEndEvenBackAtFit() {
        ReaderTouchSession session = new ReaderTouchSession();
        session.begin();
        assertFalse(session.holdsParent(false, 1));
        session.pointers(2);
        session.pointers(1);
        assertFalse(session.allowsNavigation());
        assertTrue(session.holdsParent(false, 1));
        assertFalse(session.holdsParent(true, 1));
        session.begin();
        assertTrue(session.allowsNavigation());
        assertFalse(session.holdsParent(false, 1));
    }

    @Test public void cancellationReleasesParentAndSuppressesLateCallbacksUntilNewDown() {
        ReaderTouchSession session = new ReaderTouchSession();
        session.begin();
        assertTrue(session.holdsParent(false, 2));
        session.cancel();
        assertFalse(session.holdsParent(false, 2));
        assertFalse(session.allowsNavigation());
        session.begin();
        assertTrue(session.allowsNavigation());
    }

    private ReaderGesturePolicy.Navigation fling(float dx, float dy, float vx, float vy) {
        return ReaderGesturePolicy.fling(false, 1, 400, dx, dy, vx, vy);
    }
}
