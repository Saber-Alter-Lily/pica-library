package com.picalibrary.android;

import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONObject;

/** Non-secret provider connection state mirrored from a paired Desktop. */
final class DesktopAccountStatusStore {
    private static final String PREFS="pica-desktop-account-status-v1";

    static final class Snapshot {
        final boolean picaConfigured,ehConfigured;
        final long updatedAt;
        Snapshot(boolean picaConfigured,boolean ehConfigured,long updatedAt){
            this.picaConfigured=picaConfigured;
            this.ehConfigured=ehConfigured;
            this.updatedAt=updatedAt;
        }
        boolean any(){return picaConfigured||ehConfigured;}
    }

    private static SharedPreferences prefs(Context c){
        return c.getApplicationContext().getSharedPreferences(PREFS,Context.MODE_PRIVATE);
    }

    static Snapshot load(Context c){
        SharedPreferences p=prefs(c);
        return new Snapshot(
            p.getBoolean("picaConfigured",false),
            p.getBoolean("ehConfigured",false),
            p.getLong("updatedAt",0L)
        );
    }

    static void save(Context c,JSONObject value){
        JSONObject pica=value==null?null:value.optJSONObject("pica");
        JSONObject eh=value==null?null:value.optJSONObject("eh");
        prefs(c).edit()
            .putBoolean("picaConfigured",pica!=null&&pica.optBoolean("configured",false))
            .putBoolean("ehConfigured",eh!=null&&eh.optBoolean("configured",false))
            .putLong("updatedAt",System.currentTimeMillis())
            .apply();
    }

    static void clear(Context c){prefs(c).edit().clear().apply();}
}
