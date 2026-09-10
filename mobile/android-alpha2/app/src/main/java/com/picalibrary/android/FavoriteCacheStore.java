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
    static final class Snapshot {
        final String updatedAt;final boolean coversPrefetched;final List<BridgeClient.ComicItem> items;
        Snapshot(String updatedAt,boolean coversPrefetched,List<BridgeClient.ComicItem> items){this.updatedAt=updatedAt;this.coversPrefetched=coversPrefetched;this.items=items;}
    }
    private FavoriteCacheStore(){}
    private static File file(Context context){return MobileStoragePaths.dataFile(context,"favorite-catalog-v1.json");}

    static Snapshot load(Context context){
        File source=file(context);if(!source.isFile())return new Snapshot("",false,new ArrayList<>());
        try(InputStream in=new FileInputStream(source);ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] b=new byte[8192];int n;while((n=in.read(b))>0)out.write(b,0,n);JSONObject root=new JSONObject(out.toString("UTF-8"));JSONArray arr=root.optJSONArray("items");List<BridgeClient.ComicItem> items=new ArrayList<>();if(arr!=null)for(int i=0;i<arr.length();i++){JSONObject o=arr.optJSONObject(i);if(o==null)continue;String id=o.optString("id");if(id.isEmpty())continue;items.add(new BridgeClient.ComicItem(id,o.optString("title","未命名漫画"),o.optString("author","未知作者"),o.optString("coverPath","/mobile/v1/covers/"+id),o.optInt("downloadedPictures",0)));}return new Snapshot(root.optString("updatedAt",""),root.optBoolean("coversPrefetched",false),items);}catch(Exception e){return new Snapshot("",false,new ArrayList<>());}
    }
    static Snapshot fromRemote(JSONObject root){JSONArray arr=root.optJSONArray("items");List<BridgeClient.ComicItem> items=new ArrayList<>();if(arr!=null)for(int i=0;i<arr.length();i++){JSONObject o=arr.optJSONObject(i);if(o==null)continue;String id=o.optString("comicId",o.optString("id",""));if(id.isEmpty())continue;String author=o.optString("canonicalAuthor",o.optString("author","未知作者"));if(author.isEmpty())author=o.optString("author","未知作者");items.add(new BridgeClient.ComicItem(id,o.optString("title","未命名漫画"),author,o.optString("coverPath","/mobile/v1/covers/"+id),o.optInt("downloadedPictures",0)));}return new Snapshot(root.optString("updatedAt",""),false,items);}
    static void save(Context context,List<BridgeClient.ComicItem> items,boolean coversPrefetched){
        try{JSONObject root=new JSONObject();root.put("schemaVersion",1);root.put("updatedAt",new Date().toInstant().toString());root.put("coversPrefetched",coversPrefetched);JSONArray arr=new JSONArray();for(BridgeClient.ComicItem item:items){JSONObject o=new JSONObject();o.put("id",item.id);o.put("title",item.title);o.put("author",item.author);o.put("coverPath",item.coverPath);o.put("downloadedPictures",item.downloadedPictures);arr.put(o);}root.put("items",arr);File target=file(context);target.getParentFile().mkdirs();File tmp=new File(target.getParentFile(),target.getName()+".tmp");try(OutputStream out=new FileOutputStream(tmp)){out.write(root.toString().getBytes(StandardCharsets.UTF_8));}if(target.exists()&&!target.delete())throw new IOException("favorite cache replace failed");if(!tmp.renameTo(target))throw new IOException("favorite cache rename failed");}catch(Exception e){throw new IllegalStateException("无法保存本地收藏缓存",e);}
    }
    private static boolean sameIds(List<BridgeClient.ComicItem> a,List<BridgeClient.ComicItem> b){if(a.size()!=b.size())return false;Set<String> ids=new HashSet<>();for(BridgeClient.ComicItem item:a)ids.add(item.id);for(BridgeClient.ComicItem item:b)if(!ids.remove(item.id))return false;return ids.isEmpty();}
    static List<BridgeClient.ComicItem> fetchAll(Context context) throws Exception {List<BridgeClient.ComicItem> result=new ArrayList<>();int offset=0;final int pageSize=500;while(offset<5000){JSONObject root=new JSONObject(BridgeClient.get(context,"/mobile/v1/library?scope=favorites&limit="+pageSize+"&offset="+offset+"&sort=latest"));JSONArray arr=root.optJSONArray("items");int count=arr==null?0:arr.length();if(arr!=null)for(int i=0;i<arr.length();i++){JSONObject o=arr.optJSONObject(i);if(o==null)continue;String id=o.optString("comicId");if(id.isEmpty())continue;result.add(new BridgeClient.ComicItem(id,o.optString("title","未命名漫画"),o.optString("author","未知作者"),o.optString("coverPath","/mobile/v1/covers/"+id),o.optInt("downloadedPictures",0)));}offset+=count;int total=root.optInt("total",offset);if(count<pageSize||offset>=total||count==0)break;}return result;}

    static Snapshot syncFromDesktop(Context context,boolean covers,Progress progress) throws Exception {
        List<BridgeClient.ComicItem> items=fetchAll(context);save(context,items,false);try{ShelfStore.syncFromDesktop(context);}catch(Exception ignored){}if(progress!=null)progress.update(0,items.size(),"收藏与书架元数据已导入");boolean allCovers=false;
        if(covers&&!items.isEmpty()){ExecutorService workers=Executors.newFixedThreadPool(4);AtomicInteger done=new AtomicInteger(),success=new AtomicInteger();List<Future<?>> jobs=new ArrayList<>();try{for(BridgeClient.ComicItem item:items)jobs.add(workers.submit(()->{if(CoverRepository.prefetchDesktop(context,item.id,item.coverPath))success.incrementAndGet();int current=done.incrementAndGet();if(progress!=null)progress.update(current,items.size(),"正在缓存封面");}));for(Future<?> job:jobs)try{job.get();}catch(Exception ignored){}}finally{workers.shutdownNow();}allCovers=success.get()==items.size();save(context,items,allCovers);if(progress!=null&&success.get()<items.size())progress.update(success.get(),items.size(),"封面缓存完成，部分封面暂不可用");}
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
