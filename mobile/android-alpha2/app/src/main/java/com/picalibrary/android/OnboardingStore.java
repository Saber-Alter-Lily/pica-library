package com.picalibrary.android;

import android.content.Context;
import android.content.SharedPreferences;

/** Versioned onboarding state. Later is session-only; Skip/Done are version-scoped and Replay is always available. */
final class OnboardingStore {
    static final int CURRENT_VERSION=1;
    private static final String PREFS="pica-onboarding-v1";
    private static final String COMPLETED="completedVersion";
    private static final String DISMISSED="dismissedVersion";
    private static final String AUTO="autoShow";
    private static boolean sessionDismissed=false;

    private OnboardingStore(){}

    static boolean autoShow(Context c){return c.getSharedPreferences(PREFS,Context.MODE_PRIVATE).getBoolean(AUTO,true);}
    static void setAutoShow(Context c,boolean value){c.getSharedPreferences(PREFS,Context.MODE_PRIVATE).edit().putBoolean(AUTO,value).apply();}
    static int completedVersion(Context c){return c.getSharedPreferences(PREFS,Context.MODE_PRIVATE).getInt(COMPLETED,0);}
    static int dismissedVersion(Context c){return c.getSharedPreferences(PREFS,Context.MODE_PRIVATE).getInt(DISMISSED,0);}

    static boolean shouldPrompt(Context c){
        return autoShow(c)&&!sessionDismissed&&Math.max(completedVersion(c),dismissedVersion(c))<CURRENT_VERSION;
    }
    static void later(){sessionDismissed=true;}
    static void skip(Context c){c.getSharedPreferences(PREFS,Context.MODE_PRIVATE).edit().putInt(DISMISSED,CURRENT_VERSION).apply();}
    static void complete(Context c){c.getSharedPreferences(PREFS,Context.MODE_PRIVATE).edit().putInt(COMPLETED,CURRENT_VERSION).putInt(DISMISSED,0).apply();}
    static void neverAuto(Context c){c.getSharedPreferences(PREFS,Context.MODE_PRIVATE).edit().putBoolean(AUTO,false).putInt(DISMISSED,CURRENT_VERSION).apply();}
    static void replay(){sessionDismissed=false;}
}
