package com.picalibrary.android;

import android.content.Context;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.*;
import org.json.*;

/** E-H local/cloud favorite provenance. Schema v2 preserves native favorite slots without conflating them with preference semantics. */
final class EhFavoriteStore {
    static final class RemoteFavorite {
        final String id;int slot=-1;String note="";
        RemoteFavorite(String id){this.id=id;}
        RemoteFavorite(String id,int slot,String note){this.id=id;this.slot=slot;this.note=note==null?"":note;}
    }
    static final class Snapshot {
        String updatedAt="";
        final LinkedHashSet<String> localIds=new LinkedHashSet<>(),remoteIds=new LinkedHashSet<>();
        final LinkedHashMap<String,RemoteFavorite> remote=new LinkedHashMap<>();
        final ArrayList<String> categoryNames=new ArrayList<>();
        final int[] categoryCounts=new int[10];
        Snapshot(){for(int i=0;i<10;i++)categoryNames.add("Favorites "+i);}
        int slotOf(String id){RemoteFavorite row=remote.get(id);return row==null?-1:row.slot;}
        String categoryName(int slot){return slot>=0&&slot<categoryNames.size()?categoryNames.get(slot):"";}
    }
    private EhFavoriteStore(){}
    private static File file(Context context){return MobileStoragePaths.dataFile(context,"eh-favorites-v1.json");}
    static boolean aggregate(boolean picaOrLegacy,boolean local,boolean remote){return picaOrLegacy||local||remote;}

    static Snapshot load(Context context){Snapshot s=new Snapshot();File source=file(context);if(!source.isFile())return s;try(InputStream in=new FileInputStream(source);ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] b=new byte[8192];int n;while((n=in.read(b))>0)out.write(b,0,n);JSONObject root=new JSONObject(out.toString("UTF-8"));s.updatedAt=root.optString("updatedAt","");readIds(root.optJSONArray("localIds"),s.localIds);readIds(root.optJSONArray("remoteIds"),s.remoteIds);JSONArray names=root.optJSONArray("categoryNames");if(names!=null)for(int i=0;i<Math.min(10,names.length());i++){String value=names.optString(i,"").trim();if(!value.isEmpty())s.categoryNames.set(i,value);}JSONArray counts=root.optJSONArray("categoryCounts");if(counts!=null)for(int i=0;i<Math.min(10,counts.length());i++)s.categoryCounts[i]=Math.max(0,counts.optInt(i,0));JSONArray rows=root.optJSONArray("remote");if(rows!=null)for(int i=0;i<rows.length();i++){JSONObject o=rows.optJSONObject(i);if(o==null)continue;String id=o.optString("id","");if(!EhClient.isEhId(id))continue;int slot=o.optInt("slot",-1);if(slot<0||slot>9)slot=-1;RemoteFavorite row=new RemoteFavorite(id,slot,o.optString("note",""));s.remote.put(id,row);s.remoteIds.add(id);}for(String id:s.remoteIds)if(!s.remote.containsKey(id))s.remote.put(id,new RemoteFavorite(id));recountIfNeeded(s);return s;}catch(Exception ignored){return s;}}
    private static void readIds(JSONArray arr,Set<String> out){if(arr==null)return;for(int i=0;i<arr.length();i++){String id=arr.optString(i,"");if(EhClient.isEhId(id))out.add(id);}}
    private static void recountIfNeeded(Snapshot s){boolean any=false;for(int c:s.categoryCounts)if(c>0){any=true;break;}if(any)return;for(RemoteFavorite row:s.remote.values())if(row.slot>=0&&row.slot<10)s.categoryCounts[row.slot]++;}
    private static void save(Context context,Snapshot s){try{s.updatedAt=Instant.now().toString();JSONObject root=new JSONObject();root.put("schemaVersion",2);root.put("updatedAt",s.updatedAt);root.put("localIds",new JSONArray(s.localIds));root.put("remoteIds",new JSONArray(s.remoteIds));root.put("categoryNames",new JSONArray(s.categoryNames));JSONArray counts=new JSONArray();for(int value:s.categoryCounts)counts.put(value);root.put("categoryCounts",counts);JSONArray remote=new JSONArray();for(RemoteFavorite row:s.remote.values()){JSONObject o=new JSONObject();o.put("id",row.id);o.put("slot",row.slot);if(!row.note.isEmpty())o.put("note",row.note);remote.put(o);}root.put("remote",remote);File target=file(context);target.getParentFile().mkdirs();File tmp=new File(target.getParentFile(),target.getName()+".tmp");try(OutputStream out=new FileOutputStream(tmp)){out.write(root.toString().getBytes(StandardCharsets.UTF_8));}if(target.exists()&&!target.delete())throw new IOException("E-H favorite store replace failed");if(!tmp.renameTo(target))throw new IOException("E-H favorite store rename failed");}catch(Exception e){throw new IllegalStateException("无法保存 E-H 收藏来源",e);}}

    static final class LegacySplit {final List<BridgeClient.ComicItem> remaining=new ArrayList<>();final LinkedHashSet<String> localIds=new LinkedHashSet<>();}
    static LegacySplit splitLegacy(List<BridgeClient.ComicItem> legacy){LegacySplit out=new LegacySplit();if(legacy==null)return out;for(BridgeClient.ComicItem item:legacy){if(item==null)continue;if(EhClient.isEhId(item.id))out.localIds.add(item.id);else out.remaining.add(item);}return out;}
    /** One-time, idempotent migration: persist legacy E-H locals first, then strip them from the legacy/Pica cache. */
    static synchronized Snapshot migrateLegacyEhLocals(Context context){FavoriteCacheStore.Snapshot legacy=FavoriteCacheStore.load(context);LegacySplit split=splitLegacy(legacy.items);Snapshot s=load(context);if(split.localIds.isEmpty())return s;boolean changed=s.localIds.addAll(split.localIds);if(changed)save(context,s);FavoriteCacheStore.save(context,split.remaining,legacy.coversPrefetched);return changed?load(context):s;}

    static synchronized void setLocalFavorite(Context context,String id,boolean desired){if(!EhClient.isEhId(id))throw new IllegalArgumentException("无效的 E-H 收藏标识");Snapshot s=load(context);if(desired)s.localIds.add(id);else s.localIds.remove(id);save(context,s);UnifiedCatalogStore.reconcileLocalReferences(context);NativeRecommendationStore.markFavoriteChange(context);}
    static synchronized void setRemoteFavorite(Context context,String id,boolean desired){if(!EhClient.isEhId(id))throw new IllegalArgumentException("无效的 E-H 收藏标识");Snapshot s=load(context);if(desired){s.remoteIds.add(id);s.remote.putIfAbsent(id,new RemoteFavorite(id));}else{s.remoteIds.remove(id);s.remote.remove(id);}Arrays.fill(s.categoryCounts,0);for(RemoteFavorite row:s.remote.values())if(row.slot>=0&&row.slot<10)s.categoryCounts[row.slot]++;save(context,s);UnifiedCatalogStore.reconcileLocalReferences(context);NativeRecommendationStore.markFavoriteChange(context);}
    static synchronized void replaceRemote(Context context,List<EhClient.Comic> comics){Snapshot s=load(context);LinkedHashMap<String,RemoteFavorite> prior=new LinkedHashMap<>(s.remote);s.remoteIds.clear();s.remote.clear();for(EhClient.Comic comic:comics)if(comic!=null&&EhClient.isEhId(comic.id)){s.remoteIds.add(comic.id);s.remote.put(comic.id,prior.getOrDefault(comic.id,new RemoteFavorite(comic.id)));}Arrays.fill(s.categoryCounts,0);for(RemoteFavorite row:s.remote.values())if(row.slot>=0&&row.slot<10)s.categoryCounts[row.slot]++;save(context,s);UnifiedCatalogStore.reconcileLocalReferences(context);NativeRecommendationStore.markFavoriteChange(context);}
    static synchronized void replaceRemote(Context context,EhFavoriteSync sync){if(sync==null)return;Snapshot s=load(context);s.remoteIds.clear();s.remote.clear();for(int i=0;i<10;i++){String name=i<sync.categoryNames.size()?sync.categoryNames.get(i):"";s.categoryNames.set(i,name==null||name.trim().isEmpty()?"Favorites "+i:name.trim());s.categoryCounts[i]=i<sync.categoryCounts.length?Math.max(0,sync.categoryCounts[i]):0;}for(EhFavoriteSync.Item item:sync.items){if(item==null||!EhClient.isEhId(item.comicId))continue;RemoteFavorite row=new RemoteFavorite(item.comicId,item.slot,item.note);s.remoteIds.add(item.comicId);s.remote.put(item.comicId,row);}save(context,s);UnifiedCatalogStore.reconcileLocalReferences(context);NativeRecommendationStore.markFavoriteChange(context);}
}
