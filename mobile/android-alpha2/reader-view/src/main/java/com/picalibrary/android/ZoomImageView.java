package com.picalibrary.android;

import android.content.Context;
import android.graphics.Matrix;
import android.graphics.drawable.Drawable;
import android.os.SystemClock;
import android.view.GestureDetector;
import android.view.MotionEvent;
import android.view.ScaleGestureDetector;
import android.widget.ImageView;
import com.picalibrary.android.reader.gestures.ReaderGesturePolicy;
import com.picalibrary.android.reader.gestures.ReaderTouchSession;

/** Android recognition/rendering adapter. No source, account, sync or progress persistence. */
final class ZoomImageView extends ImageView {
    interface NavigationListener { void onPrevious(); void onNext(); void onCenterTap(); }
    private final Matrix matrix = new Matrix();
    private final ReaderTouchSession touch = new ReaderTouchSession();
    private final ScaleGestureDetector scaleDetector;
    private final GestureDetector gestureDetector;
    private final GestureDetector.SimpleOnGestureListener gestureListener;
    private NavigationListener navigationListener;
    private boolean doubleTapEnabled = true;
    private int zoomPercent = 200;
    private float scale = 1f;
    private boolean pagerManaged;

    void setPagerManaged(boolean managed) { pagerManaged = managed; }

    ZoomImageView(Context context) {
        super(context);
        setScaleType(ScaleType.MATRIX);
        scaleDetector = new ScaleGestureDetector(context, new ScaleGestureDetector.SimpleOnScaleGestureListener() {
            @Override public boolean onScale(ScaleGestureDetector detector) {
                applyScale(ReaderGesturePolicy.pinchScale(scale, detector.getScaleFactor()),
                        detector.getFocusX(), detector.getFocusY());
                return true;
            }
        });
        gestureListener = new GestureDetector.SimpleOnGestureListener() {
            @Override public boolean onDown(MotionEvent e) { return true; }
            @Override public boolean onSingleTapUp(MotionEvent e) { return !doubleTapEnabled && navigateTap(e); }
            @Override public boolean onSingleTapConfirmed(MotionEvent e) { return doubleTapEnabled && navigateTap(e); }
            @Override public boolean onDoubleTap(MotionEvent e) {
                if (!doubleTapEnabled || !touch.allowsNavigation()) return false;
                float target = ReaderGesturePolicy.doubleTapTarget(scale, zoomPercent);
                if (target == 1f) resetZoom();
                else applyScale(target, e.getX(), e.getY());
                return true;
            }
            @Override public boolean onScroll(MotionEvent e1, MotionEvent e2, float dx, float dy) {
                if (!ReaderGesturePolicy.isZoomed(scale) || scaleDetector.isInProgress()) return false;
                matrix.postTranslate(-dx, -dy);
                constrain();
                setImageMatrix(matrix);
                return true;
            }
            @Override public boolean onFling(MotionEvent e1, MotionEvent e2, float vx, float vy) {
                if (!touch.allowsNavigation() || e1 == null || e2 == null) return false;
                return navigate(ReaderGesturePolicy.fling(pagerManaged, scale, getWidth(),
                        e2.getX() - e1.getX(), e2.getY() - e1.getY(), vx, vy));
            }
        };
        gestureDetector = new GestureDetector(context, gestureListener);
    }

    void setGestureSettings(ReaderGestureSettings.Snapshot settings) {
        if (doubleTapEnabled != settings.doubleTapEnabled || zoomPercent != settings.zoomPercent) cancelTouch();
        doubleTapEnabled = settings.doubleTapEnabled;
        zoomPercent = settings.zoomPercent;
        gestureDetector.setOnDoubleTapListener(doubleTapEnabled ? gestureListener : null);
        // Android's double-tap-and-drag zoom is also a double-tap gesture, unlike a two-finger pinch.
        scaleDetector.setQuickScaleEnabled(doubleTapEnabled);
    }

    private boolean navigateTap(MotionEvent event) {
        if (!touch.allowsNavigation()) return false;
        navigate(ReaderGesturePolicy.tap(event.getX(), getWidth(), scale));
        return true;
    }

    private boolean navigate(ReaderGesturePolicy.Navigation direction) {
        if (navigationListener == null || direction == ReaderGesturePolicy.Navigation.NONE) return false;
        switch (direction) {
            case LEFT: navigationListener.onPrevious(); break;
            case RIGHT: navigationListener.onNext(); break;
            case CENTER: navigationListener.onCenterTap(); break;
            default: return false;
        }
        return true;
    }

    void setNavigationListener(NavigationListener listener) { navigationListener = listener; }

    private void applyScale(float next, float x, float y) {
        matrix.postScale(next / scale, next / scale, x, y);
        scale = next;
        constrain();
        setImageMatrix(matrix);
    }

    @Override public void setImageDrawable(Drawable drawable) {
        cancelTouch();
        super.setImageDrawable(drawable);
        post(this::fitDrawable);
    }

    private void fitDrawable() {
        Drawable drawable = getDrawable();
        if (drawable == null || getWidth() <= 0 || getHeight() <= 0) return;
        int width = Math.max(1, drawable.getIntrinsicWidth()), height = Math.max(1, drawable.getIntrinsicHeight());
        float fitted = Math.min((float) getWidth() / width, (float) getHeight() / height);
        matrix.reset();
        matrix.postScale(fitted, fitted);
        matrix.postTranslate((getWidth() - width * fitted) * .5f, (getHeight() - height * fitted) * .5f);
        scale = 1f;
        setImageMatrix(matrix);
    }

    void resetZoom() { fitDrawable(); }

    @Override protected void onSizeChanged(int w, int h, int oldw, int oldh) {
        super.onSizeChanged(w, h, oldw, oldh);
        if (w != oldw || h != oldh) { cancelTouch(); fitDrawable(); }
    }

    @Override protected void onDetachedFromWindow() { cancelTouch(); super.onDetachedFromWindow(); }

    private void cancelTouch() {
        // ImageView can call overrides from its constructor, before our detectors exist.
        if (touch == null || gestureDetector == null || scaleDetector == null) return;
        touch.cancel();
        long now = SystemClock.uptimeMillis();
        MotionEvent cancel = MotionEvent.obtain(now, now, MotionEvent.ACTION_CANCEL, 0f, 0f, 0);
        scaleDetector.onTouchEvent(cancel);
        gestureDetector.onTouchEvent(cancel);
        cancel.recycle();
        if (getParent() != null) getParent().requestDisallowInterceptTouchEvent(false);
    }

    private void constrain() {
        Drawable drawable = getDrawable();
        if (drawable == null) return;
        float[] values = new float[9];
        matrix.getValues(values);
        float width = drawable.getIntrinsicWidth() * values[Matrix.MSCALE_X];
        float height = drawable.getIntrinsicHeight() * values[Matrix.MSCALE_Y];
        float tx = values[Matrix.MTRANS_X], ty = values[Matrix.MTRANS_Y];
        float x = width <= getWidth() ? (getWidth() - width) * .5f : Math.max(getWidth() - width, Math.min(0f, tx));
        float y = height <= getHeight() ? (getHeight() - height) * .5f : Math.max(getHeight() - height, Math.min(0f, ty));
        matrix.postTranslate(x - tx, y - ty);
    }

    @Override public boolean onTouchEvent(MotionEvent event) {
        int action = event.getActionMasked();
        if (action == MotionEvent.ACTION_DOWN) touch.begin();
        touch.pointers(event.getPointerCount());
        if (action == MotionEvent.ACTION_CANCEL) touch.cancel();
        boolean finished = action == MotionEvent.ACTION_UP || action == MotionEvent.ACTION_CANCEL;
        if (getParent() != null) getParent().requestDisallowInterceptTouchEvent(touch.holdsParent(finished, scale));
        scaleDetector.onTouchEvent(event);
        gestureDetector.onTouchEvent(event);
        return true;
    }
}
