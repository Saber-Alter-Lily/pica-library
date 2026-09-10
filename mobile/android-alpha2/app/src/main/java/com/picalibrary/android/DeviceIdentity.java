package com.picalibrary.android;

import android.content.Context;
import android.content.SharedPreferences;
import java.util.UUID;

/** Stable, app-local device id used only for portable state conflict attribution. */
final class DeviceIdentity {
    private static final String PREFS="portable-device-v1";
    private static final String KEY="deviceId";
    private DeviceIdentity(){}

    static synchronized String id(Context context){
        SharedPreferences prefs=context.getSharedPreferences(PREFS,Context.MODE_PRIVATE);
        String value=prefs.getString(KEY,"");
        if(value!=null&&!value.isEmpty())return value;
        value="android-"+UUID.randomUUID();
        prefs.edit().putString(KEY,value).commit();
        return value;
    }
}
