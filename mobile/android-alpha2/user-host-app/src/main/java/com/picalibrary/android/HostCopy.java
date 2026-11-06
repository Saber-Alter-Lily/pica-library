package com.picalibrary.android;

import android.content.Context;
import java.util.Locale;

/** Platform locale for the standalone source UI; never imports Reader classes. */
final class HostCopy {
    private HostCopy(){}
    static String ui(Context context,String zh,String en,String ja){
        Locale locale=context.getResources().getConfiguration().getLocales().get(0);
        String language=locale.getLanguage();
        if("ja".equals(language))return ja;
        if("en".equals(language))return en;
        return zh;
    }
}
