package com.picalibrary.android;

import android.content.Context;
import android.content.SharedPreferences;
import java.time.Instant;

/** Original portable display preferences: one source-independent local store. */
abstract class ReaderDisplaySettings {
    static final class Snapshot {
        final int mode;
        final boolean keepOn;
        final String updatedAt;
        Snapshot(int mode,boolean keepOn,String updatedAt){this.mode=mode;this.keepOn=keepOn;this.updatedAt=updatedAt==null?"":updatedAt;}
    }

    private static final String PREFS="reader-display";
    private static final String UPDATED="portableUpdatedAt";
    ReaderDisplaySettings(){}

    static Snapshot local(Context context){
        SharedPreferences p=context.getSharedPreferences(PREFS,Context.MODE_PRIVATE);int mode=p.getInt("mode",0);if(mode<0||mode>2)mode=0;return new Snapshot(mode,p.getBoolean("keepOn",true),p.getString(UPDATED,""));
    }

    static Snapshot saveLocal(Context context,int mode,boolean keepOn){
        int safe=mode<0||mode>2?0:mode;String now=Instant.now().toString();context.getSharedPreferences(PREFS,Context.MODE_PRIVATE).edit().putInt("mode",safe).putBoolean("keepOn",keepOn).putString(UPDATED,now).apply();return new Snapshot(safe,keepOn,now);
    }

    static Snapshot applyRemote(Context context,int mode,boolean keepOn,String updatedAt){
        context.getSharedPreferences(PREFS,Context.MODE_PRIVATE).edit().putInt("mode",mode).putBoolean("keepOn",keepOn).putString(UPDATED,updatedAt).apply();return new Snapshot(mode,keepOn,updatedAt);
    }
}
