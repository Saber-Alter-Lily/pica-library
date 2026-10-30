package com.picalibrary.android;

import java.net.HttpURLConnection;

/** Minimal image transport; provider authorization stays in the app adapter. */
interface ReaderImageTransport {
    @FunctionalInterface interface CacheWrite { void run() throws Exception; }

    String scope();
    HttpURLConnection image(String path) throws Exception;
    void commitImageCache(CacheWrite write);
    boolean isAccessRevoked(Throwable error);
    String diagnose(String path);
}
