package com.picalibrary.android;

import android.content.Context;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
import org.json.JSONObject;

/**
 * Exact-match localization bridge for legacy hard-coded UI literals.
 *
 * Only literals present in the generated allow-list are translated. Unknown
 * strings and user content are returned unchanged. Ambiguous literals are
 * excluded by the generator and must use semantic resources instead.
 */
final class LocalizedText {
    private static final String ASSET="locales/shared-literals.json";
    private static final Object LOCK=new Object();
    private static String loadedLanguage=null;
    private static Map<String,String> loaded=Map.of();

    private LocalizedText(){}

    static String ui(Context c,String source){
        if(source==null||source.isEmpty())return source;
        String language=LocaleStore.language(c);
        if(LocaleStore.ZH_CN.equals(language))return source;
        ensure(c,language);
        String value=loaded.get(source);
        return value==null?source:value;
    }

    static boolean has(Context c,String source){
        if(source==null||source.isEmpty())return false;
        String language=LocaleStore.language(c);
        if(LocaleStore.ZH_CN.equals(language))return false;
        ensure(c,language);
        return loaded.containsKey(source);
    }

    private static void ensure(Context c,String language){
        synchronized(LOCK){
            if(language.equals(loadedLanguage))return;
            Map<String,String> next=new HashMap<>();
            try(InputStream in=c.getApplicationContext().getAssets().open(ASSET)){
                String raw=new String(in.readAllBytes(),StandardCharsets.UTF_8);
                JSONObject root=new JSONObject(raw);
                JSONObject rows=root.getJSONObject("byLanguage").optJSONObject(language);
                if(rows!=null){
                    for(String key:rows.keySet())next.put(key,rows.optString(key,key));
                }
            }catch(Exception ignored){
                // Missing/generated assets fail open: UI stays on source text.
            }
            loaded=next;
            loadedLanguage=language;
        }
    }
}
