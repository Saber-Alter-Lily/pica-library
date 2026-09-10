package com.picalibrary.android;

import android.content.Context;

final class BridgeStore {
    private static final String PREFS = "pica_bridge";

    static void save(Context c, String host, String token, String serverName) {
        c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putString("host", host)
            .putString("token", token)
            .putString("serverName", serverName)
            .apply();
    }

    static String host(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString("host", "");
    }

    static String token(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString("token", "");
    }

    static String serverName(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString("serverName", "");
    }

    static boolean paired(Context c) {
        return !host(c).isEmpty();
    }

    static void clear(Context c) {
        c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().apply();
    }
}
