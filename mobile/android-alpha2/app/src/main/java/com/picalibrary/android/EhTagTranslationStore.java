package com.picalibrary.android;

import android.content.Context;
import android.content.SharedPreferences;
import java.io.*;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.text.Normalizer;
import java.util.*;
import java.util.concurrent.*;
import org.json.*;

/** Optional Chinese presentation/search aliases for canonical E-H tags. Canonical identity never depends on this store. */
final class EhTagTranslationStore {
    static final class Suggestion {
        final String canonical,namespace,rawValue,display;
        Suggestion(String canonical,String namespace,String rawValue,String display){this.canonical=canonical;this.namespace=namespace;this.rawValue=rawValue;this.display=display;}
    }
    private static final String SHA_URL="https://raw.githubusercontent.com/EhTagTranslation/DatabaseReleases/refs/heads/master/sha";
    private static final String DATA_URL="https://raw.githubusercontent.com/EhTagTranslation/DatabaseReleases/refs/heads/master/db.text.json";
    private static final long CHECK_INTERVAL_MS=24L*60L*60L*1000L;
    private static final ExecutorService UPDATE=Executors.newSingleThreadExecutor();
    private static volatile EhTagTranslationStore INSTANCE;

    private final Map<String,Map<String,String>> groups=new LinkedHashMap<>();
    private final List<Suggestion> searchable=new ArrayList<>();
    private String sourceSha="";

    private static final Map<String,String> NS_ZH=new LinkedHashMap<>();
    private static final Map<String,String> CATEGORY_ZH=new LinkedHashMap<>();
    static {
        NS_ZH.put("rows","分类");NS_ZH.put("female","女性");NS_ZH.put("male","男性");NS_ZH.put("mixed","混合");NS_ZH.put("language","语言");NS_ZH.put("parody","原作");NS_ZH.put("character","角色");NS_ZH.put("artist","画师");NS_ZH.put("group","社团");NS_ZH.put("cosplayer","Cosplayer");NS_ZH.put("location","地点");NS_ZH.put("other","其他");NS_ZH.put("reclass","重新分类");
        CATEGORY_ZH.put("doujinshi","同人志");CATEGORY_ZH.put("manga","漫画");CATEGORY_ZH.put("artist cg","画师 CG");CATEGORY_ZH.put("artistcg","画师 CG");CATEGORY_ZH.put("game cg","游戏 CG");CATEGORY_ZH.put("gamecg","游戏 CG");CATEGORY_ZH.put("image set","图片集");CATEGORY_ZH.put("imageset","图片集");CATEGORY_ZH.put("cosplay","Cosplay");CATEGORY_ZH.put("asian porn","亚洲色情");CATEGORY_ZH.put("asianporn","亚洲色情");CATEGORY_ZH.put("non-h","非 H");CATEGORY_ZH.put("western","西方作品");CATEGORY_ZH.put("misc","其他");CATEGORY_ZH.put("private","私有");
    }

    private EhTagTranslationStore(Context context){loadDisk(context);}
    static EhTagTranslationStore load(Context context){EhTagTranslationStore value=INSTANCE;if(value!=null)return value;synchronized(EhTagTranslationStore.class){if(INSTANCE==null)INSTANCE=new EhTagTranslationStore(context.getApplicationContext());return INSTANCE;}}

    static String namespaceLabel(String namespace){String key=norm(namespace);return NS_ZH.getOrDefault(key,namespace==null?"":namespace);}
    static String categoryLabel(String category){String key=norm(category);return CATEGORY_ZH.getOrDefault(key,category==null?"":category);}

    String displayCanonical(String canonical){String raw=canonical==null?"":canonical.trim();int at=raw.indexOf(':');if(at<=0)return raw;return display(raw.substring(0,at),raw.substring(at+1));}
    String display(String namespace,String rawValue){String ns=norm(namespace),value=normTag(rawValue);Map<String,String> group=groups.get(ns);String zh=group==null?null:group.get(value);return zh==null||zh.trim().isEmpty()?rawValue:zh.trim();}
    boolean hasTranslation(String namespace,String rawValue){Map<String,String> group=groups.get(norm(namespace));return group!=null&&group.containsKey(normTag(rawValue));}
    String sourceSha(){return sourceSha;}
    boolean initialized(){return !groups.isEmpty();}

    List<Suggestion> suggest(String query,int limit){String q=normSearch(query);if(q.isEmpty())return Collections.emptyList();ArrayList<Suggestion> prefix=new ArrayList<>(),contains=new ArrayList<>();for(Suggestion s:searchable){String raw=normSearch(s.rawValue),display=normSearch(s.display),canonical=normSearch(s.canonical);boolean start=raw.startsWith(q)||display.startsWith(q)||canonical.startsWith(q);if(start)prefix.add(s);else if(raw.contains(q)||display.contains(q))contains.add(s);if(prefix.size()>=limit)break;}ArrayList<Suggestion> out=new ArrayList<>();out.addAll(prefix);for(Suggestion s:contains){if(out.size()>=limit)break;out.add(s);}return out;}

    static void scheduleUpdate(Context context,Runnable onUpdated){Context app=context.getApplicationContext();UPDATE.submit(()->{boolean changed=false;try{changed=updateIfNeeded(app,false);}catch(Exception ignored){}if(changed&&onUpdated!=null)new android.os.Handler(android.os.Looper.getMainLooper()).post(onUpdated);});}
    static boolean forceUpdate(Context context) throws Exception {return updateIfNeeded(context.getApplicationContext(),true);}

    private static synchronized boolean updateIfNeeded(Context context,boolean force) throws Exception {
        SharedPreferences prefs=context.getSharedPreferences("eh-tag-translation-v1",Context.MODE_PRIVATE);long now=System.currentTimeMillis(),last=prefs.getLong("lastCheck",0);if(!force&&now-last<CHECK_INTERVAL_MS)return false;
        String remoteSha=fetchText(SHA_URL,1024).trim();if(remoteSha.isEmpty())throw new IOException("标签翻译版本信息为空");File data=dataFile(context);String localSha=prefs.getString("sourceSha","");if(!force&&data.isFile()&&remoteSha.equals(localSha)){prefs.edit().putLong("lastCheck",now).apply();return false;}
        String raw=fetchText(DATA_URL,8*1024*1024);EhTagTranslationStore parsed=parse(raw,remoteSha);if(parsed.searchable.size()<1000)throw new IOException("标签翻译数据不完整");File tmp=new File(data.getParentFile(),data.getName()+".tmp");data.getParentFile().mkdirs();try(OutputStream out=new FileOutputStream(tmp)){out.write(raw.getBytes(StandardCharsets.UTF_8));}if(data.exists()&&!data.delete())throw new IOException("标签翻译替换失败");if(!tmp.renameTo(data))throw new IOException("标签翻译替换失败");prefs.edit().putString("sourceSha",remoteSha).putLong("lastCheck",now).apply();INSTANCE=parsed;return true;
    }

    private void loadDisk(Context context){try{File f=dataFile(context);if(!f.isFile())return;String raw=readFile(f,8*1024*1024);String sha=context.getSharedPreferences("eh-tag-translation-v1",Context.MODE_PRIVATE).getString("sourceSha","");EhTagTranslationStore parsed=parse(raw,sha);groups.putAll(parsed.groups);searchable.addAll(parsed.searchable);sourceSha=parsed.sourceSha;}catch(Exception ignored){}}
    private static EhTagTranslationStore parse(String raw,String sha) throws Exception {EhTagTranslationStore out=new EhTagTranslationStore();out.sourceSha=sha==null?"":sha;JSONObject root=new JSONObject(raw);JSONArray data=root.optJSONArray("data");if(data==null)throw new IOException("标签翻译格式异常");for(int i=0;i<data.length();i++){JSONObject group=data.optJSONObject(i);if(group==null)continue;String namespace=norm(group.optString("namespace",""));JSONObject values=group.optJSONObject("data");if(namespace.isEmpty()||values==null)continue;LinkedHashMap<String,String> map=new LinkedHashMap<>();Iterator<String> keys=values.keys();while(keys.hasNext()){String rawTag=keys.next();JSONObject row=values.optJSONObject(rawTag);if(row==null)continue;String name=row.optString("name","").trim();String key=normTag(rawTag);if(key.isEmpty())continue;map.put(key,name);if(!"rows".equals(namespace))out.searchable.add(new Suggestion(namespace+":"+key,namespace,key,name.isEmpty()?key:name));}out.groups.put(namespace,map);}return out;}
    private EhTagTranslationStore(){}

    private static File dataFile(Context context){return MobileStoragePaths.dataFile(context,"eh-tag-translations-v1.json");}
    private static String readFile(File file,int max) throws Exception {try(InputStream in=new FileInputStream(file);ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] b=new byte[32768];int n;while((n=in.read(b))>0){if(out.size()+n>max)throw new IOException("标签翻译文件过大");out.write(b,0,n);}return out.toString("UTF-8");}}
    private static String fetchText(String raw,int max) throws Exception {URL u=new URL(raw);if(!"https".equalsIgnoreCase(u.getProtocol())||!"raw.githubusercontent.com".equalsIgnoreCase(u.getHost()))throw new SecurityException("标签翻译地址未通过安全校验");HttpURLConnection c=(HttpURLConnection)u.openConnection();c.setConnectTimeout(8000);c.setReadTimeout(20000);c.setInstanceFollowRedirects(true);c.setRequestProperty("User-Agent","Pica-Library-Android/0.1");c.setRequestProperty("Accept","application/json,text/plain,*/*;q=0.8");try{int status=c.getResponseCode();if(status<200||status>=300)throw new IOException("标签翻译 HTTP "+status);try(InputStream in=c.getInputStream();ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] b=new byte[32768];int n;while((n=in.read(b))>0){if(out.size()+n>max)throw new IOException("标签翻译响应过大");out.write(b,0,n);}return out.toString("UTF-8");}}finally{c.disconnect();}}

    private static String normTag(String value){return norm(value);}
    private static String normSearch(String value){String text=Normalizer.normalize(value==null?"":value,Normalizer.Form.NFKC).trim().toLowerCase(Locale.ROOT);return text.replaceAll("\\s+"," ");}
    private static String norm(String value){return normSearch(value);}
}
