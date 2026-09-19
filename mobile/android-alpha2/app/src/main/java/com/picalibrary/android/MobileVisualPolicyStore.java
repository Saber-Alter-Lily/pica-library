package com.picalibrary.android;

import android.content.Context;
import android.content.SharedPreferences;

/** Device-local Visual serving policy. Heavy Visual learning remains Desktop-authored. */
final class MobileVisualPolicyStore {
    private static final String PREFS="recommendation-visual-mobile-v1";
    private static final String MODE="mode";
    static final String OFF="OFF",SHADOW="SHADOW",LIVE="LIVE";

    private MobileVisualPolicyStore(){}

    private static SharedPreferences prefs(Context c){
        return c.getApplicationContext().getSharedPreferences(PREFS,Context.MODE_PRIVATE);
    }

    static String mode(Context c){
        String value=prefs(c).getString(MODE,SHADOW);
        return OFF.equals(value)||LIVE.equals(value)?value:SHADOW;
    }

    static void setMode(Context c,String value){
        String next=OFF.equals(value)?OFF:LIVE.equals(value)?LIVE:SHADOW;
        prefs(c).edit().putString(MODE,next).apply();
    }

    static boolean live(Context c){return LIVE.equals(mode(c));}
    static String label(Context c){
        String value=mode(c);
        if(OFF.equals(value))return "关闭";
        if(LIVE.equals(value))return "Live · 低权重参与本机排序";
        return "Shadow · 只计算不改本机排序";
    }
}
