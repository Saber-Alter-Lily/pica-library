package com.picalibrary.android;

import android.content.Context;
import android.graphics.Matrix;
import android.graphics.drawable.Drawable;
import android.view.GestureDetector;
import android.view.MotionEvent;
import android.view.ScaleGestureDetector;
import android.widget.ImageView;

final class ZoomImageView extends ImageView {
    interface NavigationListener {
        void onPrevious();
        void onNext();
        void onCenterTap();
    }

    private final Matrix matrix = new Matrix();
    private final ScaleGestureDetector scaleDetector;
    private final GestureDetector gestureDetector;
    private NavigationListener navigationListener;
    private float scale = 1f;
    private float baseScale = 1f;
    private float translateX = 0f;
    private float translateY = 0f;
    private boolean laidOutOnce = false;

    ZoomImageView(Context context) {
        super(context);
        setScaleType(ScaleType.MATRIX);
        scaleDetector = new ScaleGestureDetector(context, new ScaleGestureDetector.SimpleOnScaleGestureListener() {
            @Override public boolean onScale(ScaleGestureDetector detector) {
                float next = Math.max(1f, Math.min(4f, scale * detector.getScaleFactor()));
                float factor = next / scale;
                scale = next;
                matrix.postScale(factor, factor, detector.getFocusX(), detector.getFocusY());
                constrain();
                setImageMatrix(matrix);
                return true;
            }
        });
        gestureDetector = new GestureDetector(context, new GestureDetector.SimpleOnGestureListener() {
            @Override public boolean onDown(MotionEvent e) { return true; }
            @Override public boolean onSingleTapConfirmed(MotionEvent e) {
                if (navigationListener == null) return true;
                if (scale > 1.03f) return true;
                float x = e.getX();
                if (x < getWidth() * .28f) navigationListener.onPrevious();
                else if (x > getWidth() * .72f) navigationListener.onNext();
                else navigationListener.onCenterTap();
                return true;
            }
            @Override public boolean onDoubleTap(MotionEvent e) {
                if (scale > 1.05f) resetZoom();
                else {
                    float factor = 2f / scale;
                    scale = 2f;
                    matrix.postScale(factor, factor, e.getX(), e.getY());
                    constrain();
                    setImageMatrix(matrix);
                }
                return true;
            }
            @Override public boolean onScroll(MotionEvent e1, MotionEvent e2, float distanceX, float distanceY) {
                if (scale <= 1.03f) return false;
                matrix.postTranslate(-distanceX, -distanceY);
                translateX -= distanceX;
                translateY -= distanceY;
                constrain();
                setImageMatrix(matrix);
                return true;
            }
            @Override public boolean onFling(MotionEvent e1, MotionEvent e2, float velocityX, float velocityY) {
                if (scale > 1.03f || navigationListener == null || e1 == null || e2 == null) return false;
                float dx = e2.getX() - e1.getX();
                if (Math.abs(dx) < getWidth() * .18f || Math.abs(velocityX) < 500f) return false;
                if (dx < 0) navigationListener.onNext(); else navigationListener.onPrevious();
                return true;
            }
        });
    }

    void setNavigationListener(NavigationListener listener) { this.navigationListener = listener; }

    @Override public void setImageDrawable(Drawable drawable) {
        super.setImageDrawable(drawable);
        laidOutOnce = false;
        post(this::fitDrawable);
    }

    private void fitDrawable() {
        Drawable d = getDrawable();
        if (d == null || getWidth() <= 0 || getHeight() <= 0) return;
        int dw = Math.max(1, d.getIntrinsicWidth());
        int dh = Math.max(1, d.getIntrinsicHeight());
        float sx = (float)getWidth() / dw;
        float sy = (float)getHeight() / dh;
        baseScale = Math.min(sx, sy);
        float dx = (getWidth() - dw * baseScale) * .5f;
        float dy = (getHeight() - dh * baseScale) * .5f;
        matrix.reset();
        matrix.postScale(baseScale, baseScale);
        matrix.postTranslate(dx, dy);
        scale = 1f;
        translateX = dx;
        translateY = dy;
        setImageMatrix(matrix);
        laidOutOnce = true;
    }

    void resetZoom() {
        fitDrawable();
    }

    private void constrain() {
        Drawable d = getDrawable();
        if (d == null) return;
        float[] values = new float[9];
        matrix.getValues(values);
        float currentScale = values[Matrix.MSCALE_X];
        float width = d.getIntrinsicWidth() * currentScale;
        float height = d.getIntrinsicHeight() * currentScale;
        float tx = values[Matrix.MTRANS_X];
        float ty = values[Matrix.MTRANS_Y];
        float minX = Math.min(0f, getWidth() - width);
        float maxX = Math.max(0f, (getWidth() - width) * .5f);
        float minY = Math.min(0f, getHeight() - height);
        float maxY = Math.max(0f, (getHeight() - height) * .5f);
        float wantedX = width <= getWidth() ? (getWidth() - width) * .5f : Math.max(minX, Math.min(0f, tx));
        float wantedY = height <= getHeight() ? (getHeight() - height) * .5f : Math.max(minY, Math.min(0f, ty));
        matrix.postTranslate(wantedX - tx, wantedY - ty);
    }

    @Override public boolean onTouchEvent(MotionEvent event) {
        scaleDetector.onTouchEvent(event);
        gestureDetector.onTouchEvent(event);
        return true;
    }
}
