package com.picalibrary.android;

import android.content.Context;
import java.util.Locale;

/** Reuse platform locale instead of importing provider-specific app localization. */
final class LocalCopy {
    private LocalCopy(){}

    static String ui(Context context,String zh,String en,String ja){
        Locale locale=context.getResources().getConfiguration().getLocales().get(0);
        String language=locale.getLanguage();
        if("ja".equals(language))return ja;
        if("en".equals(language))return en;
        return zh;
    }
}
