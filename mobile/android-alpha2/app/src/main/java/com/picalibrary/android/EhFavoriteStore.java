package com.picalibrary.android;

import android.content.Context;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.*;
import org.json.*;

/** E-H local and cloud favorite provenance, kept separate from the legacy/Pica favorite cache. */
final class EhFavoriteStore {
    static final class Snapshot {
        String updatedAt="";
        final LinkedHashSet<String> localIds=new LinkedHashSet<>(),remoteIds=new LinkedHashSet<>();
    }
    private EhFavoriteStore(){}
    private static File file(Context context){return MobileStoragePaths.dataFile(context,"eh-favorites-v1.json");}
    static boolean aggregate(boolean picaOrLegacy,boolean local,boolean remote){return picaOrLegacy||local||remote;}

    static Snapshot load(Context context){Snapshot s=new Snapshot();File source=file(context);if(!source.isFile())return s;try(InputStream in=new FileInputStream(source);ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] b=new byte[8192];int n;while((n=in.read(b))>0)out.write(b,0,n);JSONObject root=new JSONObject(out.toString("UTF-8"));s.updatedAt=root.optString("updatedAt","");readIds(root.optJSONArray("localIds"),s.localIds);readIds(root.optJSONArray("remoteIds"),s.remoteIds);}catch(Exception ignored){}return s;}
    private static void readIds(JSONArray arr,Set<String> out){if(arr==null)return;for(int i=0;i<arr.length();i++){String id=arr.optString(i,"");if(EhClient.isEhId(id))out.add(id);}}
    private static void save(Context context,Snapshot s){try{s.updatedAt=Instant.now().toString();JSONObject root=new JSONObject();root.put("schemaVersion",1);root.put("updatedAt",s.updatedAt);root.put("localIds",new JSONArray(s.localIds));root.put("remoteIds",new JSONArray(s.remoteIds));File target=file(context);target.getParentFile().mkdirs();File tmp=new File(target.getParentFile(),target.getName()+".tmp");try(OutputStream out=new FileOutputStream(tmp)){out.write(root.toString().getBytes(StandardCharsets.UTF_8));}if(target.exists()&&!target.delete())throw new IOException("E-H favorite store replace failed");if(!tmp.renameTo(target))throw new IOException("E-H favorite store rename failed");}catch(Exception e){throw new IllegalStateException("无法保存 E-H 收藏来源",e);}}
    static final class LegacySplit {
        final List<BridgeClient.ComicItem> remaining=new ArrayList<>();
        final LinkedHashSet<String> localIds=new LinkedHashSet<>();
    }
    static LegacySplit splitLegacy(List<BridgeClient.ComicItem> legacy){LegacySplit out=new LegacySplit();if(legacy==null)return out;for(BridgeClient.ComicItem item:legacy){if(item==null)continue;if(EhClient.isEhId(item.id))out.localIds.add(item.id);else out.remaining.add(item);}return out;}
    /** One-time, idempotent migration: persist legacy E-H locals first, then strip them from the legacy/Pica cache. */
    static synchronized Snapshot migrateLegacyEhLocals(Context context){FavoriteCacheStore.Snapshot legacy=FavoriteCacheStore.load(context);LegacySplit split=splitLegacy(legacy.items);Snapshot s=load(context);if(split.localIds.isEmpty())return s;boolean changed=s.localIds.addAll(split.localIds);if(changed)save(context,s);FavoriteCacheStore.save(context,split.remaining,legacy.coversPrefetched);return changed?load(context):s;}
    static synchronized void setLocalFavorite(Context context,String id,boolean desired){if(!EhClient.isEhId(id))throw new IllegalArgumentException("无效的 E-H 收藏标识");Snapshot s=load(context);if(desired)s.localIds.add(id);else s.localIds.remove(id);save(context,s);UnifiedCatalogStore.reconcileLocalReferences(context);NativeRecommendationStore.markFavoriteChange(context);}
    static synchronized void setRemoteFavorite(Context context,String id,boolean desired){if(!EhClient.isEhId(id))throw new IllegalArgumentException("无效的 E-H 收藏标识");Snapshot s=load(context);if(desired)s.remoteIds.add(id);else s.remoteIds.remove(id);save(context,s);UnifiedCatalogStore.reconcileLocalReferences(context);NativeRecommendationStore.markFavoriteChange(context);}
    static synchronized void replaceRemote(Context context,List<EhClient.Comic> comics){Snapshot s=load(context);s.remoteIds.clear();for(EhClient.Comic comic:comics)if(comic!=null&&EhClient.isEhId(comic.id))s.remoteIds.add(comic.id);save(context,s);UnifiedCatalogStore.reconcileLocalReferences(context);NativeRecommendationStore.markFavoriteChange(context);}
}
