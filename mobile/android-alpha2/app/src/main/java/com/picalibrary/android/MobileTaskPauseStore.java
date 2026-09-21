package com.picalibrary.android;

import android.content.Context;
import android.content.SharedPreferences;

/** Durable user-requested pause markers for resumable/background WorkManager jobs. */
final class MobileTaskPauseStore {
    private static final String PREFS="background-task-pauses-v1";
    private MobileTaskPauseStore(){}

    private static SharedPreferences prefs(Context context){
        return context.getApplicationContext().getSharedPreferences(PREFS,Context.MODE_PRIVATE);
    }
    private static String key(String scope,String id){
        return scope+":"+ReaderPolicy.hash(id==null?"":id);
    }
    static void setPaused(Context context,String scope,String id,boolean paused){
        String key=key(scope,id);
        SharedPreferences.Editor editor=prefs(context).edit();
        if(paused)editor.putBoolean(key,true);else editor.remove(key);
        editor.apply();
    }
    static boolean isPaused(Context context,String scope,String id){
        return prefs(context).getBoolean(key(scope,id),false);
    }
}
