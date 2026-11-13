package com.picalibrary.android.reader.gestures;

/** One touch stream's ownership, not a replacement for Android's gesture detectors. */
public final class ReaderTouchSession {
    private boolean multiTouch;
    private boolean cancelled;

    public void begin() { multiTouch = false; cancelled = false; }
    public void pointers(int count) { if (count > 1) multiTouch = true; }
    public void cancel() { cancelled = true; }
    public boolean allowsNavigation() { return !cancelled && !multiTouch; }

    public boolean holdsParent(boolean finished, float scale) {
        return !finished && !cancelled && (multiTouch || ReaderGesturePolicy.isZoomed(scale));
    }
}
