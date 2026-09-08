package com.picalibrary.android;

import android.app.Activity;
import android.graphics.Bitmap;
import android.graphics.drawable.ColorDrawable;
import android.util.LruCache;
import android.widget.ImageView;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

final class ImageRepository {
    private static final int MAX_BYTES = 72 * 1024 * 1024;
    private static final LruCache<String, Bitmap> CACHE = new LruCache<String, Bitmap>(MAX_BYTES) {
        @Override protected int sizeOf(String key, Bitmap value) { return value.getByteCount(); }
    };
    private static final ExecutorService POOL = Executors.newFixedThreadPool(6);

    private ImageRepository() {}

    static Bitmap cached(String path) {
        synchronized (CACHE) { return CACHE.get(path); }
    }

    static void put(String path, Bitmap bitmap) {
        if (path == null || bitmap == null) return;
        synchronized (CACHE) { CACHE.put(path, bitmap); }
    }

    static void load(Activity activity, ImageView target, String path, int placeholderColor) {
        if (path == null || path.isEmpty()) {
            target.setImageDrawable(new ColorDrawable(placeholderColor));
            return;
        }
        target.setTag(path);
        Bitmap hit = cached(path);
        if (hit != null) {
            target.setImageBitmap(hit);
            return;
        }
        target.setImageDrawable(new ColorDrawable(placeholderColor));
        POOL.submit(() -> {
            try {
                Bitmap bitmap = BridgeClient.bitmap(activity, path);
                put(path, bitmap);
                activity.runOnUiThread(() -> {
                    Object tag = target.getTag();
                    if (tag != null && path.equals(tag.toString())) target.setImageBitmap(bitmap);
                });
            } catch (Exception ignored) {}
        });
    }

    static void prefetch(Activity activity, String path) {
        if (path == null || path.isEmpty() || cached(path) != null) return;
        POOL.submit(() -> {
            try { put(path, BridgeClient.bitmap(activity, path)); } catch (Exception ignored) {}
        });
    }
}
