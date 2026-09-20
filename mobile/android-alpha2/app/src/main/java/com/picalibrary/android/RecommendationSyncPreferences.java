package com.picalibrary.android;

import android.content.Context;
import android.content.SharedPreferences;

/** User-owned notification policy for optional Desktop↔Android recommendation synchronization. */
final class RecommendationSyncPreferences {
    private static final String PREFS="recommendation-sync-ui-v1";
    private static final String CHECK_ON_CONNECTION="check_on_connection";
    private static final String ALERT_PORTABLE_CHANGES="alert_portable_changes";
    private static final String ALERT_CONFLICTS="alert_conflicts";

    private RecommendationSyncPreferences(){}

    private static SharedPreferences prefs(Context c){
        return c.getSharedPreferences(PREFS,Context.MODE_PRIVATE);
    }

    /** Background compare only. It never applies a sync. */
    static boolean checkOnConnection(Context c){
        return prefs(c).getBoolean(CHECK_ON_CONNECTION,true);
    }

    /** Ordinary portable/foundation differences are quiet by default. */
    static boolean alertPortableChanges(Context c){
        return prefs(c).getBoolean(ALERT_PORTABLE_CHANGES,false);
    }

    /** Concurrent explicit-preference conflicts are the only default modal reminder. */
    static boolean alertConflicts(Context c){
        return prefs(c).getBoolean(ALERT_CONFLICTS,true);
    }

    static void setCheckOnConnection(Context c,boolean value){
        prefs(c).edit().putBoolean(CHECK_ON_CONNECTION,value).apply();
    }

    static void setAlertPortableChanges(Context c,boolean value){
        prefs(c).edit().putBoolean(ALERT_PORTABLE_CHANGES,value).apply();
    }

    static void setAlertConflicts(Context c,boolean value){
        prefs(c).edit().putBoolean(ALERT_CONFLICTS,value).apply();
    }
}
