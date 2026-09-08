package com.picalibrary.android;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.os.Handler;
import android.os.Looper;
import java.io.*;
import java.net.HttpURLConnection;
import java.util.Arrays;
import java.util.Comparator;
import java.util.concurrent.*;

/** Disk cache contains encoded pages; decoded images belong only to visible holders. */
final class ReaderImages implements AutoCloseable {
    interface Callback { void complete(Bitmap bitmap); void failed(); }
    static final class Request {
        volatile boolean cancelled;
        volatile HttpURLConnection connection;
        Future<?> future;
        void cancel() {
            cancelled = true;
            if (connection != null) connection.disconnect();
            if (future != null) future.cancel(true);
        }
    }
    private final ExecutorService workers = Executors.newFixedThreadPool(3);
    private final Handler main = new Handler(Looper.getMainLooper());
    private final File cache;
    private final ReaderSource source;
    private volatile boolean closed;
    private static final long LIMIT = 256L * 1024 * 1024;
    ReaderImages(Context context, ReaderSource source) {
        this.source = source;
        cache = new File(context.getCacheDir(), "reader-pages/" + source.scope());
        cache.mkdirs();
    }
    Request load(String path, int width, Callback callback) {
        Request request = new Request();
        request.future = workers.submit(() -> {
            File target = new File(cache, ReaderPolicy.hash(path));
            File partial = null;
            try {
                if (!target.isFile()) {
                    partial = File.createTempFile("page-", ".part", cache);
                    HttpURLConnection connection = source.image(path);
                    request.connection = connection;
                    try {
                        if (request.cancelled || closed) throw new IOException("cancelled");
                        int status = connection.getResponseCode();
                        if (status != 200) throw new IOException("HTTP " + status);
                        try (InputStream in = connection.getInputStream(); OutputStream out = new FileOutputStream(partial)) {
                            byte[] buffer = new byte[32768]; int n; long bytes = 0;
                            while ((n = in.read(buffer)) != -1) {
                                if (request.cancelled || closed || Thread.currentThread().isInterrupted()) throw new IOException("cancelled");
                                bytes += n;
                                if (bytes > 64L * 1024 * 1024) throw new IOException("page too large");
                                out.write(buffer, 0, n);
                            }
                        }
                    } finally { connection.disconnect(); request.connection = null; }
                    BitmapFactory.Options bounds = new BitmapFactory.Options(); bounds.inJustDecodeBounds = true;
                    BitmapFactory.decodeFile(partial.getPath(), bounds);
                    if (bounds.outWidth <= 0 || bounds.outHeight <= 0) throw new IOException("invalid image");
                    synchronized (ReaderImages.class) {
                        if (!target.exists() && !partial.renameTo(target)) throw new IOException("cache rename failed");
                    }
                }
                if (request.cancelled || closed) return;
                BitmapFactory.Options options = new BitmapFactory.Options(); options.inJustDecodeBounds = true;
                BitmapFactory.decodeFile(target.getPath(), options);
                options.inSampleSize = ReaderPolicy.sampleSize(options.outWidth, options.outHeight, width);
                options.inJustDecodeBounds = false;
                Bitmap bitmap = BitmapFactory.decodeFile(target.getPath(), options);
                if (bitmap == null) { target.delete(); throw new IOException("decode failed"); }
                target.setLastModified(System.currentTimeMillis());
                main.post(() -> { if (!request.cancelled && !closed) callback.complete(bitmap); else bitmap.recycle(); });
                trim(target);
            } catch (Exception | OutOfMemoryError e) {
                main.post(() -> { if (!request.cancelled && !closed) callback.failed(); });
            } finally { if (partial != null) partial.delete(); }
        });
        return request;
    }
    private synchronized void trim(File active) {
        File[] files = cache.listFiles(file -> !file.getName().endsWith(".part"));
        if (files == null) return;
        Arrays.sort(files, Comparator.comparingLong(File::lastModified));
        long total = 0; for (File file : files) total += file.length();
        for (File file : files) if (total > LIMIT && !file.equals(active)) { long n = file.length(); if (file.delete()) total -= n; }
    }
    public void close() { closed = true; workers.shutdownNow(); }
}
