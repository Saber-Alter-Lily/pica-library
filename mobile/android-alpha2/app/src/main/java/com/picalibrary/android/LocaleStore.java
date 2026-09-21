package com.picalibrary.android;

import android.content.Context;
import android.content.SharedPreferences;
import android.content.res.Configuration;
import android.os.LocaleList;
import java.util.Locale;

/** Per-app interface language. v1 intentionally defaults existing installs to Simplified Chinese. */
final class LocaleStore {
    static final String ZH_CN="zh-CN";
    static final String JA="ja";
    static final String EN="en";
    private static final String PREFS="pica-locale-v1";
    private static final String KEY="language";

    private LocaleStore(){}

    static String language(Context c){
        String value=c.getSharedPreferences(PREFS,Context.MODE_PRIVATE).getString(KEY,ZH_CN);
        if(JA.equals(value)||EN.equals(value)||ZH_CN.equals(value))return value;
        return ZH_CN;
    }

    static boolean set(Context c,String language){
        String normalized=JA.equals(language)?JA:EN.equals(language)?EN:ZH_CN;
        String before=language(c);
        c.getSharedPreferences(PREFS,Context.MODE_PRIVATE).edit().putString(KEY,normalized).apply();
        return !before.equals(normalized);
    }

    static Context wrap(Context base){
        String language=language(base);
        Locale locale=Locale.forLanguageTag(language);
        Locale.setDefault(locale);
        Configuration config=new Configuration(base.getResources().getConfiguration());
        config.setLocales(new LocaleList(locale));
        config.setLocale(locale);
        return base.createConfigurationContext(config);
    }
}
