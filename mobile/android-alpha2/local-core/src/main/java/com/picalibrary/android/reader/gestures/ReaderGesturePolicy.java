package com.picalibrary.android.reader.gestures;

/** Pure reader decisions. Android owns touch recognition; the Reader owns page order. */
public final class ReaderGesturePolicy {
    public enum Navigation { NONE, LEFT, CENTER, RIGHT }

    private ReaderGesturePolicy() {}

    public static int normalizeZoomPercent(int value) {
        return value == 150 || value == 200 || value == 300 ? value : 200;
    }

    public static boolean isZoomed(float scale) {
        return Float.isFinite(scale) && scale > 1.03f;
    }

    public static float doubleTapTarget(float scale, int zoomPercent) {
        return Float.isFinite(scale) && scale > 1.05f ? 1f : normalizeZoomPercent(zoomPercent) / 100f;
    }

    public static float pinchScale(float scale, float factor) {
        float current = Float.isFinite(scale) ? Math.max(1f, Math.min(4f, scale)) : 1f;
        if (!Float.isFinite(factor) || factor <= 0f) return current;
        return Math.max(1f, Math.min(4f, current * factor));
    }

    public static Navigation tap(float x, float width, float scale) {
        if (!Float.isFinite(x) || !Float.isFinite(width) || width <= 0f || !Float.isFinite(scale)) {
            return Navigation.NONE;
        }
        if (isZoomed(scale)) return Navigation.CENTER;
        if (x < width * .28f) return Navigation.LEFT;
        if (x > width * .72f) return Navigation.RIGHT;
        return Navigation.CENTER;
    }

    public static Navigation fling(boolean pagerManaged, float scale, float width,
            float dx, float dy, float velocityX, float velocityY) {
        if (pagerManaged || isZoomed(scale) || !Float.isFinite(scale) || !Float.isFinite(width) || width <= 0f
                || !Float.isFinite(dx) || !Float.isFinite(dy)
                || !Float.isFinite(velocityX) || !Float.isFinite(velocityY)) return Navigation.NONE;
        // Keep the existing distance/speed thresholds. A mainly vertical drag must not turn pages.
        if (Math.abs(dx) < width * .18f || Math.abs(velocityX) < 500f
                || Math.abs(dx) <= Math.abs(dy) || Math.abs(velocityX) <= Math.abs(velocityY)) {
            return Navigation.NONE;
        }
        return dx < 0 ? Navigation.RIGHT : Navigation.LEFT;
    }
}
