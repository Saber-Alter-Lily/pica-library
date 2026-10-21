package com.picalibrary.android;

import android.content.Context;
import com.google.gson.Gson;
import java.util.*;
import org.json.*;
import org.picalibrary.sources.JmSource;

/** Native phone source. It does not depend on Desktop/LAN availability. Call from a worker. */
final class JmClientManager {
    private static JmClientManager instance;
    private final Context context;
    private final JmSource source=new JmSource();
    private final Gson json=new Gson();
    private boolean restoreAttempted;
    private volatile int generation;
    private volatile Preview preview;
    private static final class Preview {final String token,accountId;final long expires;final JSONArray items;Preview(String token,String accountId,JSONArray items){this.token=token;this.accountId=accountId;this.items=items;expires=System.currentTimeMillis()+900000;}}
    private JmClientManager(Context c){context=c.getApplicationContext();}
    static synchronized JmClientManager get(Context c){if(instance==null)instance=new JmClientManager(c);return instance;}
    private JSONObject object(Object value) throws Exception{return new JSONObject(json.toJson(value));}
    private JSONArray array(Object value) throws Exception{return new JSONArray(json.toJson(value));}
    private synchronized void restore() throws Exception {
        if(restoreAttempted)return;restoreAttempted=true;JSONObject saved=JmAccountStore.load(context);
        if(!saved.optString("username").isEmpty()){Map<String,Object> identity=source.login(saved.getString("username"),saved.getString("password"));JmAccountStore.sessionScope(context,String.valueOf(identity.get("accountId")));}
    }
    synchronized JSONObject status() throws Exception {restore();return object(source.status());}
    synchronized JSONObject login(String username,String password,boolean remember) throws Exception {
        cancel();restoreAttempted=true;JmAccountStore.clear(context);
        try {
            JSONObject identity=object(source.login(username,password));
            if(remember)JmAccountStore.save(context,username,password,identity.getString("accountId"));else JmAccountStore.sessionScope(context,identity.getString("accountId"));
            identity.put("remembered",remember);return identity;
        } catch(Exception error) {source.close();JmAccountStore.clear(context);throw error;}
    }
    synchronized void logout(){cancel();restoreAttempted=true;source.close();JmAccountStore.clear(context);}
    JSONObject search(String query,int page) throws Exception {restore();return object(source.search(query,page));}
    JSONObject details(String comicId) throws Exception {restore();return object(source.details(comicId));}
    JSONArray episodes(String comicId) throws Exception {restore();return array(source.episodes(comicId));}
    JSONArray pages(String episodeId) throws Exception {restore();return array(source.pages(episodeId));}
    byte[] image(String locator) throws Exception {restore();return source.image(locator,20*1024*1024);}
    void cancel(){generation++;preview=null;}
    JSONObject previewFavorites() throws Exception {
        cancel();final int current=generation;restore();JSONObject identity=object(source.status());String accountId=identity.optString("accountId");if(!identity.optBoolean("configured")||accountId.isEmpty())throw new IllegalStateException("请先登录 JM");
        LinkedHashMap<String,JSONObject> items=new LinkedHashMap<>();int total=-1,pages=-1;
        for(int page=1;;page++){
            if(current!=generation)throw new IllegalStateException("收藏扫描已取消");
            JSONObject result=object(source.favorites(0,page));
            if(page==1){total=result.getInt("total");pages=result.getInt("pages");}
            if(total<0||total>10000||pages<0||pages>500||result.getInt("page")!=page||result.getInt("total")!=total||result.getInt("pages")!=pages||!accountId.equals(result.optString("accountId")))throw new IllegalStateException("收藏分页发生变化，请重新扫描");
            JSONArray rows=result.getJSONArray("items");if(total>0&&rows.length()==0)throw new IllegalStateException("收藏分页不完整，尚未导入");
            for(int i=0;i<rows.length();i++){JSONObject row=rows.getJSONObject(i);String id=row.getString("comicId");if(!id.matches("jm:[1-9][0-9]{0,14}"))throw new IllegalStateException("收藏标识无效");items.put(id,row);}
            if(page>=Math.max(1,pages))break;
        }
        if(current!=generation||items.size()!=total||!accountId.equals(source.status().get("accountId")))throw new IllegalStateException("收藏扫描失效，尚未导入");
        Preview ready=new Preview(UUID.randomUUID().toString(),accountId,new JSONArray(items.values()));preview=ready;
        return new JSONObject().put("token",ready.token).put("count",items.size());
    }
    synchronized int confirm(String token) throws Exception {
        Preview ready=preview;if(ready==null||!ready.token.equals(token)||System.currentTimeMillis()>ready.expires||!ready.accountId.equals(source.status().get("accountId")))throw new IllegalStateException("收藏预览失效，请重新扫描");
        merge(ready.items,true);preview=null;return ready.items.length();
    }
    JSONObject enrichFavorites() throws Exception {
        final int current=++generation;restore();UnifiedCatalogStore.Snapshot catalog=UnifiedCatalogStore.load(context);List<String> pending=new ArrayList<>();
        for(UnifiedCatalogStore.Entry entry:catalog.entries())if(entry.id.startsWith("jm:")&&entry.favorite&&!entry.jmMetadataComplete)pending.add(entry.id);
        int updated=0,failed=0;
        for(String id:pending.subList(0,Math.min(20,pending.size()))){if(current!=generation)break;try{JSONObject detail=details(id);if(current!=generation)break;merge(new JSONArray().put(detail),false);updated++;}catch(Exception error){failed++;}}
        return new JSONObject().put("updated",updated).put("failed",failed).put("remaining",pending.size()-updated);
    }
    void merge(JSONArray rows,boolean favorite) throws Exception {
        mergeCatalog(context,rows,favorite);
    }
    static void mergeCatalog(Context context,JSONArray rows,boolean favorite) throws Exception {
        synchronized(UnifiedCatalogStore.class){
            UnifiedCatalogStore.Snapshot catalog=UnifiedCatalogStore.load(context);
            for(int i=0;i<rows.length();i++){
                JSONObject row=rows.getJSONObject(i);String id=row.getString("comicId");if(!id.matches("jm:[1-9][0-9]{0,14}"))throw new IllegalArgumentException("无效的 JM 作品标识");UnifiedCatalogStore.Entry entry=catalog.byId.get(id);if(entry==null){entry=new UnifiedCatalogStore.Entry(id);catalog.byId.put(id,entry);}
                entry.providerId="jm";entry.providerRemoteId=row.optString("providerRemoteId");entry.title=row.optString("title",entry.title);String author=row.optString("author");if(!author.isEmpty()||entry.author.equals("未知作者"))entry.author=author;String description=row.optString("description");if(!description.isEmpty())entry.description=description;entry.completionStatus="UNKNOWN";
                JSONObject metadata=row.optJSONObject("providerMetadata");if(metadata!=null&&"DETAIL".equals(metadata.optString("metadataCompleteness")))entry.jmMetadataComplete=true;
                if(!entry.sourceBindings.contains("jm"))entry.sourceBindings.add("jm");String cover=row.optString("coverUrl");if(!cover.isEmpty())entry.picaCoverUrl=cover;
                JSONArray tags=row.optJSONArray("tags");if(tags!=null&&tags.length()>0){entry.tags.clear();for(int j=0;j<tags.length();j++)entry.tags.add(tags.getString(j));}
                JSONArray categories=row.optJSONArray("categories");if(categories!=null&&categories.length()>0){entry.categories.clear();for(int j=0;j<categories.length();j++)entry.categories.add(categories.getString(j));}
                entry.knownPictures=Math.max(entry.knownPictures,row.optInt("pagesCount",0));
                if(favorite){entry.jmFavorite=true;entry.favorite=true;}
            }
            UnifiedCatalogStore.save(context,catalog);
        }
    }
}
