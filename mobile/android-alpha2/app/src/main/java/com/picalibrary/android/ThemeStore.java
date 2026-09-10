package com.picalibrary.android;

import android.app.UiModeManager;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.res.Configuration;
import android.os.Build;
import java.util.Locale;

/** Appearance preferences. Basic day/night modes stay free; advanced fields are reserved for verified supporters. */
final class ThemeStore {
    static final String MODE_SYSTEM="system", MODE_LIGHT="light", MODE_DARK="dark";
    static final String[] MODES={MODE_SYSTEM,MODE_LIGHT,MODE_DARK};
    private static final String PREF="appearance-v1";
    private static final String KEY_MODE="mode",KEY_ACCENT="accent",KEY_CARD="card",KEY_DENSITY="density";

    static final class Profile {
        final String mode,accent,card,density;
        Profile(String mode,String accent,String card,String density){this.mode=mode;this.accent=accent;this.card=card;this.density=density;}
    }

    private ThemeStore(){}
    static Profile load(Context c){SharedPreferences p=c.getSharedPreferences(PREF,Context.MODE_PRIVATE);return new Profile(normalizeMode(p.getString(KEY_MODE,MODE_SYSTEM)),p.getString(KEY_ACCENT,"violet"),p.getString(KEY_CARD,"soft"),p.getString(KEY_DENSITY,"standard"));}
    static String mode(Context c){return load(c).mode;}
    static String normalizeMode(String value){if(MODE_LIGHT.equals(value)||MODE_DARK.equals(value))return value;return MODE_SYSTEM;}
    static void setMode(Context c,String mode){String value=normalizeMode(mode);c.getSharedPreferences(PREF,Context.MODE_PRIVATE).edit().putString(KEY_MODE,value).apply();applyPlatformNightMode(c,value);}
    static boolean isDark(Context c){String mode=mode(c);if(MODE_DARK.equals(mode))return true;if(MODE_LIGHT.equals(mode))return false;return (c.getResources().getConfiguration().uiMode&Configuration.UI_MODE_NIGHT_MASK)==Configuration.UI_MODE_NIGHT_YES;}
    static String effectiveKey(Context c){Profile p=load(c);return p.mode+":"+(isDark(c)?"dark":"light")+":"+p.accent+":"+p.card+":"+p.density+":"+(SupporterEntitlement.themePacksEnabled(c)?ThemePackStore.activeId(c):"");}
    static String label(Context c){String mode=mode(c);if(MODE_LIGHT.equals(mode))return "浅色";if(MODE_DARK.equals(mode))return "深色";return "跟随系统";}

    static void applyPlatformNightMode(Context c,String mode){
        if(Build.VERSION.SDK_INT<31)return;
        UiModeManager manager=(UiModeManager)c.getSystemService(Context.UI_MODE_SERVICE);if(manager==null)return;
        int value;
        if(MODE_DARK.equals(mode))value=UiModeManager.MODE_NIGHT_YES;
        else if(MODE_LIGHT.equals(mode))value=UiModeManager.MODE_NIGHT_NO;
        else{
            int system=manager.getNightMode();
            if(system!=UiModeManager.MODE_NIGHT_NO&&system!=UiModeManager.MODE_NIGHT_YES&&system!=UiModeManager.MODE_NIGHT_AUTO&&system!=UiModeManager.MODE_NIGHT_CUSTOM)return;
            value=system;
        }
        try{manager.setApplicationNightMode(value);}catch(Exception ignored){}
    }

    static void saveAdvancedProfile(Context c,String accent,String card,String density){if(!SupporterEntitlement.themePacksEnabled(c))throw new SecurityException("个性化装扮尚未解锁");c.getSharedPreferences(PREF,Context.MODE_PRIVATE).edit().putString(KEY_ACCENT,safe(accent,"violet")).putString(KEY_CARD,safe(card,"soft")).putString(KEY_DENSITY,safe(density,"standard")).apply();}
    private static String safe(String value,String fallback){String v=value==null?"":value.trim().toLowerCase(Locale.ROOT);return v.isEmpty()?fallback:v;}
}
