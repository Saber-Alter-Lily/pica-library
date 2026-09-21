package com.picalibrary.android;

import android.content.Context;
import java.io.InputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
import java.util.Iterator;
import android.content.res.AssetManager;
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
    private static Context applicationContext=null;

    private LocalizedText(){}

    static void init(Context c){
        if(c!=null)applicationContext=c.getApplicationContext();
    }

    static String ui(String source){
        Context c=applicationContext;
        return c==null?source:ui(c,source);
    }

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
            try{
                AssetManager assets=c.getApplicationContext().getAssets();
                String[] files=assets.list("locales");
                if(files!=null)for(String name:files){
                    if(name==null||!name.endsWith(".json"))continue;
                    try(InputStream in=assets.open("locales/"+name)){
                        ByteArrayOutputStream buffer=new ByteArrayOutputStream();
                        byte[] chunk=new byte[8192];
                        int read;
                        while((read=in.read(chunk))!=-1)buffer.write(chunk,0,read);
                        String raw=new String(buffer.toByteArray(),StandardCharsets.UTF_8);
                        JSONObject root=new JSONObject(raw);
                        JSONObject byLanguage=root.optJSONObject("byLanguage");
                        JSONObject rows=byLanguage==null?null:byLanguage.optJSONObject(language);
                        if(rows!=null){
                            Iterator<String> keys=rows.keys();
                            while(keys.hasNext()){String key=keys.next();next.put(key,rows.optString(key,key));}
                        }
                    }catch(Exception ignoredFile){}
                }
            }catch(Exception ignored){
                // Missing/generated assets fail open: UI stays on source text.
            }
            loaded=next;
            loadedLanguage=language;
        }
    }
}
