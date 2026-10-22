package com.picalibrary.android;

import android.content.Context;
import java.util.UUID;

/** A non-secret job binding. Login/logout invalidates queued work, but never deletes downloads. */
final class JmDownloadSession {
    private static final String PREFS = "jm-download-session-v1";

    private JmDownloadSession() {}

    static synchronized String current(Context context) {
        android.content.SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String epoch = prefs.getString("epoch", "");
        if (epoch.isEmpty()) {
            epoch = UUID.randomUUID().toString();
            if (!prefs.edit().putString("epoch", epoch).commit())
                throw new IllegalStateException("Cannot persist JM download session");
        }
        return ReaderPolicy.hash(epoch + "\n" + JmAccountStore.scope(context));
    }

    static synchronized void invalidate(Context context) {
        if (!context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
                .putString("epoch", UUID.randomUUID().toString()).commit())
            throw new IllegalStateException("Cannot invalidate JM download session");
    }

    static void require(Context context, String expected) throws Changed {
        if (expected == null || expected.isEmpty() || !expected.equals(current(context))) throw new Changed();
    }

    static final class Changed extends Exception {}
}
