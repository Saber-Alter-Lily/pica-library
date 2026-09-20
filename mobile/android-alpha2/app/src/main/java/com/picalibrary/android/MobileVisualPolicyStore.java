package com.picalibrary.android;

import android.content.Context;
import android.content.SharedPreferences;

/** Device-local Visual serving policy. Heavy Visual learning remains Desktop-authored. */
final class MobileVisualPolicyStore {
    private static final String PREFS="recommendation-visual-mobile-v1";
    private static final String MODE="mode",STRENGTH="strength";
    static final String OFF="OFF",SHADOW="SHADOW",LIVE="LIVE";
    static final String LIGHT="LIGHT",STANDARD="STANDARD",STRONG="STRONG";

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

    static String strength(Context c){
        String value=prefs(c).getString(STRENGTH,STANDARD);
        return LIGHT.equals(value)||STRONG.equals(value)?value:STANDARD;
    }

    static void setStrength(Context c,String value){
        String next=LIGHT.equals(value)?LIGHT:STRONG.equals(value)?STRONG:STANDARD;
        prefs(c).edit().putString(STRENGTH,next).apply();
    }

    static boolean live(Context c){return LIVE.equals(mode(c));}
    static String strengthLabel(Context c){
        String value=strength(c);
        if(LIGHT.equals(value))return "轻度";
        if(STRONG.equals(value))return "强";
        return "标准";
    }
    static String label(Context c){
        String value=mode(c);
        if(OFF.equals(value))return "关闭 · 不影响常规推荐";
        if(LIVE.equals(value))return "Live · "+strengthLabel(c)+"强度";
        return "Shadow · 只计算不改本机排序";
    }
}
