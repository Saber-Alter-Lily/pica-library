package com.picalibrary.android;

import android.content.Context;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import org.json.*;

/** Persistent lightweight favorite catalog plus optional lifecycle-independent cover warm-up. */
final class FavoriteCacheStore {
    interface Progress { void update(int done,int total,String phase); }
    interface Control { boolean stopped(); }
    static final class Snapshot {
        final String updatedAt,lastPicaFullSyncAt,lastPicaQuickSyncAt;final boolean coversPrefetched;final int picaRemoteCount;final List<BridgeClient.ComicItem> items;
        Snapshot(String updatedAt,boolean coversPrefetched,List<BridgeClient.ComicItem> items,String lastPicaFullSyncAt,String lastPicaQuickSyncAt,int picaRemoteCount){this.updatedAt=updatedAt;this.coversPrefetched=coversPrefetched;this.items=items;this.lastPicaFullSyncAt=lastPicaFullSyncAt==null?"":lastPicaFullSyncAt;this.lastPicaQuickSyncAt=lastPicaQuickSyncAt==null?"":lastPicaQuickSyncAt;this.picaRemoteCount=Math.max(0,picaRemoteCount);}
        Map<String,Integer> favoriteRankById(){LinkedHashMap<String,Integer> out=new LinkedHashMap<>();int rank=0;for(BridgeClient.ComicItem item:items)if(item!=null&&!EhClient.isEhId(item.id)&&!out.containsKey(item.id))out.put(item.id,rank++);return out;}
        int picaCount(){int count=0;for(BridgeClient.ComicItem item:items)if(item!=null&&!EhClient.isEhId(item.id))count++;return count;}
    }
    private FavoriteCacheStore(){}
    private static File file(Context context){return MobileStoragePaths.dataFile(context,"favorite-catalog-v1.json");}

    static Snapshot load(Context context){
        File source=file(context);if(!source.isFile())return new Snapshot("",false,new ArrayList<>(),"","",0);
        try(InputStream in=new FileInputStream(source);ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] b=new byte[8192];int n;while((n=in.read(b))>0)out.write(b,0,n);JSONObject root=new JSONObject(out.toString("UTF-8"));JSONArray arr=root.optJSONArray("items");List<BridgeClient.ComicItem> items=new ArrayList<>();if(arr!=null)for(int i=0;i<arr.length();i++){JSONObject o=arr.optJSONObject(i);if(o==null)continue;String id=o.optString("id");if(id.isEmpty())continue;items.add(new BridgeClient.ComicItem(id,o.optString("title","未命名漫画"),o.optString("author","未知作者"),o.optString("coverPath","/mobile/v1/covers/"+id),o.optInt("downloadedPictures",0)));}return new Snapshot(root.optString("updatedAt",""),root.optBoolean("coversPrefetched",false),items,root.optString("lastPicaFullSyncAt",""),root.optString("lastPicaQuickSyncAt",""),root.optInt("picaRemoteCount",0));}catch(Exception e){return new Snapshot("",false,new ArrayList<>(),"","",0);}
    }
    static Snapshot fromRemote(JSONObject root){JSONArray arr=root.optJSONArray("items");List<BridgeClient.ComicItem> items=new ArrayList<>();if(arr!=null)for(int i=0;i<arr.length();i++){JSONObject o=arr.optJSONObject(i);if(o==null)continue;String id=o.optString("comicId",o.optString("id",""));if(id.isEmpty())continue;String author=o.optString("canonicalAuthor",o.optString("author","未知作者"));if(author.isEmpty())author=o.optString("author","未知作者");items.add(new BridgeClient.ComicItem(id,o.optString("title","未命名漫画"),author,o.optString("coverPath","/mobile/v1/covers/"+id),o.optInt("downloadedPictures",0)));}return new Snapshot(root.optString("updatedAt",""),false,items,"","",0);}
    static void save(Context context,List<BridgeClient.ComicItem> items,boolean coversPrefetched){Snapshot prior=load(context);saveInternal(context,items,coversPrefetched,prior.lastPicaFullSyncAt,prior.lastPicaQuickSyncAt,prior.picaRemoteCount);}
    static void savePicaSync(Context context,List<BridgeClient.ComicItem> items,boolean coversPrefetched,boolean full,int remoteCount){Snapshot prior=load(context);String now=new Date().toInstant().toString();saveInternal(context,items,coversPrefetched,full?now:prior.lastPicaFullSyncAt,full?prior.lastPicaQuickSyncAt:now,remoteCount);}
    private static void saveInternal(Context context,List<BridgeClient.ComicItem> items,boolean coversPrefetched,String lastPicaFullSyncAt,String lastPicaQuickSyncAt,int picaRemoteCount){
        try{JSONObject root=new JSONObject();root.put("schemaVersion",2);root.put("updatedAt",new Date().toInstant().toString());root.put("coversPrefetched",coversPrefetched);root.put("lastPicaFullSyncAt",lastPicaFullSyncAt==null?"":lastPicaFullSyncAt);root.put("lastPicaQuickSyncAt",lastPicaQuickSyncAt==null?"":lastPicaQuickSyncAt);root.put("picaRemoteCount",Math.max(0,picaRemoteCount));JSONArray arr=new JSONArray();for(BridgeClient.ComicItem item:items){JSONObject o=new JSONObject();o.put("id",item.id);o.put("title",item.title);o.put("author",item.author);o.put("coverPath",item.coverPath);o.put("downloadedPictures",item.downloadedPictures);arr.put(o);}root.put("items",arr);File target=file(context);target.getParentFile().mkdirs();File tmp=new File(target.getParentFile(),target.getName()+".tmp");try(OutputStream out=new FileOutputStream(tmp)){out.write(root.toString().getBytes(StandardCharsets.UTF_8));}if(target.exists()&&!target.delete())throw new IOException("favorite cache replace failed");if(!tmp.renameTo(target))throw new IOException("favorite cache rename failed");}catch(Exception e){throw new IllegalStateException("无法保存本地收藏缓存",e);}
    }
    private static boolean sameIds(List<BridgeClient.ComicItem> a,List<BridgeClient.ComicItem> b){if(a.size()!=b.size())return false;Set<String> ids=new HashSet<>();for(BridgeClient.ComicItem item:a)ids.add(item.id);for(BridgeClient.ComicItem item:b)if(!ids.remove(item.id))return false;return ids.isEmpty();}
    static List<BridgeClient.ComicItem> fetchAll(Context context) throws Exception {return fetchAll(context,null,null);}
    static List<BridgeClient.ComicItem> fetchAll(Context context,Control control,Progress progress) throws Exception {List<BridgeClient.ComicItem> result=new ArrayList<>();int offset=0;final int pageSize=500;while(offset<5000){if(control!=null&&control.stopped())throw new InterruptedException("收藏导入已停止");JSONObject root=new JSONObject(BridgeClient.get(context,"/mobile/v1/library?scope=favorites&limit="+pageSize+"&offset="+offset+"&sort=latest"));JSONArray arr=root.optJSONArray("items");int count=arr==null?0:arr.length();if(arr!=null)for(int i=0;i<arr.length();i++){JSONObject o=arr.optJSONObject(i);if(o==null)continue;String id=o.optString("comicId");if(id.isEmpty())continue;result.add(new BridgeClient.ComicItem(id,o.optString("title","未命名漫画"),o.optString("author","未知作者"),o.optString("coverPath","/mobile/v1/covers/"+id),o.optInt("downloadedPictures",0)));}offset+=count;int total=root.optInt("total",offset);if(progress!=null)progress.update(Math.min(offset,total),total,"正在读取电脑收藏");if(count<pageSize||offset>=total||count==0)break;}return result;}

    static Snapshot syncFromDesktop(Context context,boolean covers,Progress progress) throws Exception {return syncFromDesktop(context,covers,progress,null);}
    static Snapshot syncFromDesktop(Context context,boolean covers,Progress progress,Control control) throws Exception {
        List<BridgeClient.ComicItem> items=fetchAll(context,control,progress);if(control!=null&&control.stopped())throw new InterruptedException("收藏导入已停止");save(context,items,false);try{ShelfStore.syncFromDesktop(context);}catch(Exception ignored){}if(progress!=null)progress.update(0,items.size(),"收藏与书架元数据已导入");boolean allCovers=false;
        if(covers&&!items.isEmpty()){ExecutorService workers=Executors.newFixedThreadPool(4);AtomicInteger done=new AtomicInteger(),success=new AtomicInteger();List<Future<?>> jobs=new ArrayList<>();try{for(BridgeClient.ComicItem item:items)jobs.add(workers.submit(()->{if(control!=null&&control.stopped())return;if(CoverRepository.prefetchDesktop(context,item.id,item.coverPath))success.incrementAndGet();if(control!=null&&control.stopped())return;int current=done.incrementAndGet();if(progress!=null)progress.update(current,items.size(),"正在缓存封面");}));for(Future<?> job:jobs)try{job.get();}catch(Exception ignored){}}finally{workers.shutdownNow();}if(control!=null&&control.stopped())throw new InterruptedException("收藏导入已停止");allCovers=success.get()==items.size();save(context,items,allCovers);if(progress!=null&&success.get()<items.size())progress.update(success.get(),items.size(),"封面缓存完成，部分封面暂不可用");}
        if(progress!=null)progress.update(items.size(),items.size(),covers?(allCovers?"收藏、书架和封面已缓存":"收藏与书架已缓存；部分封面可稍后重试"):"收藏与书架元数据已缓存");return load(context);
    }
    static Snapshot syncFromRemote(Context context) throws Exception {Snapshot prior=load(context);Snapshot remote=fromRemote(new RemoteLibraryClient(context).favorites());boolean keepCovers=prior.coversPrefetched&&sameIds(prior.items,remote.items);save(context,remote.items,keepCovers);return load(context);}

    static synchronized void setLocalFavorite(Context context,String comicId,String title,String author,boolean desired){
        Snapshot prior=load(context);List<BridgeClient.ComicItem> next=new ArrayList<>();boolean found=false;
        for(BridgeClient.ComicItem item:prior.items){if(item.id.equals(comicId)){found=true;if(desired)next.add(new BridgeClient.ComicItem(comicId,title==null||title.isEmpty()?item.title:title,author==null||author.isEmpty()?item.author:author,item.coverPath,item.downloadedPictures));}else next.add(item);}
        if(desired&&!found)next.add(new BridgeClient.ComicItem(comicId,title==null||title.isEmpty()?"未命名漫画":title,author==null||author.isEmpty()?"未知作者":author,"",0));
        save(context,next,false);UnifiedCatalogStore.reconcileLocalReferences(context);NativeRecommendationStore.markFavoriteChange(context);
    }

    static long metadataBytes(Context context){File f=file(context);return f.isFile()?f.length():0;}
    static void clear(Context context){File f=file(context);if(f.exists())f.delete();}
}
