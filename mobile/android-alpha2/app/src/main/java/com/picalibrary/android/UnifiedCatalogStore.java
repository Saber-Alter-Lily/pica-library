package com.picalibrary.android;

import android.content.Context;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.*;
import org.json.*;

/**
 * Persistent mobile catalog keyed by comicId. Source refreshes update availability
 * instead of deleting comics; user-state and richer metadata survive source churn.
 */
final class UnifiedCatalogStore {
    static final class Entry {
        final String id;
        String title="未命名漫画",author="未知作者",canonicalAuthor="",authorId="",updatedAt="";
        String desktopCoverPath="",remoteCoverPath="";
        final List<String> tags=new ArrayList<>(),categories=new ArrayList<>(),shelfIds=new ArrayList<>();
        boolean finished,favorite,inShelf,phoneDownloaded,desktopAvailable,desktopDownloaded,remoteAvailable,picaAvailable;
        int knownPictures,desktopDownloadedPictures,remotePageCount;

        Entry(String id){this.id=id;}
        Entry(String id,String title,String author){this.id=id;this.title=safe(title,"未命名漫画");this.author=safe(author,"未知作者");}
        String displayAuthor(){return canonicalAuthor==null||canonicalAuthor.isEmpty()?author:canonicalAuthor;}
    }

    static final class Snapshot {
        String generatedAt="",desktopUpdatedAt="",remoteUpdatedAt="",remoteGeneration="";
        final LinkedHashMap<String,Entry> byId=new LinkedHashMap<>();
        List<Entry> entries(){return new ArrayList<>(byId.values());}
    }

    private UnifiedCatalogStore(){}
    private static File file(Context context){return new File(context.getFilesDir(),"unified-catalog-v1.json");}

    static Snapshot load(Context context){
        File source=file(context);if(!source.isFile())return new Snapshot();
        try(InputStream in=new FileInputStream(source);ByteArrayOutputStream out=new ByteArrayOutputStream()){
            byte[] buffer=new byte[16384];int n;while((n=in.read(buffer))>0)out.write(buffer,0,n);
            JSONObject root=new JSONObject(out.toString("UTF-8"));Snapshot snapshot=new Snapshot();
            snapshot.generatedAt=root.optString("generatedAt","");snapshot.desktopUpdatedAt=root.optString("desktopUpdatedAt","");snapshot.remoteUpdatedAt=root.optString("remoteUpdatedAt","");snapshot.remoteGeneration=root.optString("remoteGeneration","");
            JSONArray arr=root.optJSONArray("entries");if(arr!=null)for(int i=0;i<arr.length();i++){Entry entry=parseEntry(arr.optJSONObject(i));if(entry!=null)snapshot.byId.put(entry.id,entry);}return snapshot;
        }catch(Exception e){return new Snapshot();}
    }

    static void save(Context context,Snapshot snapshot){
        try{
            snapshot.generatedAt=Instant.now().toString();JSONObject root=new JSONObject();root.put("schemaVersion",1);root.put("generatedAt",snapshot.generatedAt);root.put("desktopUpdatedAt",snapshot.desktopUpdatedAt);root.put("remoteUpdatedAt",snapshot.remoteUpdatedAt);root.put("remoteGeneration",snapshot.remoteGeneration);JSONArray arr=new JSONArray();for(Entry entry:snapshot.byId.values())arr.put(json(entry));root.put("entries",arr);
            File target=file(context),tmp=new File(target.getParentFile(),target.getName()+".tmp");try(OutputStream out=new FileOutputStream(tmp)){out.write(root.toString().getBytes(StandardCharsets.UTF_8));}
            if(target.exists()&&!target.delete())throw new IOException("unified catalog replace failed");if(!tmp.renameTo(target))throw new IOException("unified catalog rename failed");
        }catch(Exception e){throw new IllegalStateException("无法保存统一书库目录",e);}
    }

    /** Full Desktop snapshot. Call only after a successful bridge read. */
    static Snapshot refreshDesktop(Context context) throws Exception {
        Snapshot snapshot=load(context);for(Entry entry:snapshot.byId.values()){entry.desktopAvailable=false;entry.desktopDownloaded=false;entry.desktopDownloadedPictures=0;}
        int offset=0,total=Integer.MAX_VALUE;final int pageSize=500;
        while(offset<total&&offset<20000){
            JSONObject root=new JSONObject(BridgeClient.get(context,"/mobile/v1/library?scope=all&limit="+pageSize+"&offset="+offset+"&sort=latest"));JSONArray arr=root.optJSONArray("items");int count=arr==null?0:arr.length();total=Math.max(0,root.optInt("total",offset+count));
            if(arr!=null)for(int i=0;i<arr.length();i++){JSONObject o=arr.optJSONObject(i);if(o!=null)mergeDesktop(snapshot,o);}
            if(count==0||count<pageSize)break;offset+=count;
        }
        snapshot.desktopUpdatedAt=Instant.now().toString();applyShelfReferences(context,snapshot);save(context,snapshot);return snapshot;
    }

    /** Full published WebDAV generation. Missing comics lose only remote availability. */
    static Snapshot refreshRemote(Context context) throws Exception {
        Snapshot snapshot=load(context);for(Entry entry:snapshot.byId.values()){entry.remoteAvailable=false;entry.remotePageCount=0;entry.remoteCoverPath="";}
        RemoteLibraryClient client=new RemoteLibraryClient(context);JSONObject pointer=client.json("v1/control/current.json");String generation=pointer.optString("generation","");String catalogPath=pointer.optString("catalogPath","");if(catalogPath.isEmpty())throw new IllegalStateException("云端书库尚未发布");
        JSONObject root=client.json(catalogPath);JSONArray arr=root.optJSONArray("comics");if(arr!=null)for(int i=0;i<arr.length();i++){JSONObject o=arr.optJSONObject(i);if(o!=null)mergeRemote(snapshot,o);}
        snapshot.remoteGeneration=generation;snapshot.remoteUpdatedAt=Instant.now().toString();applyShelfReferences(context,snapshot);save(context,snapshot);return snapshot;
    }

    static Snapshot reconcileLocalReferences(Context context){Snapshot snapshot=load(context);applyShelfReferences(context,snapshot);FavoriteCacheStore.Snapshot favorites=FavoriteCacheStore.load(context);if(!favorites.items.isEmpty()){for(Entry entry:snapshot.byId.values())entry.favorite=false;for(BridgeClient.ComicItem item:favorites.items){Entry entry=entry(snapshot,item.id);entry.favorite=true;basic(entry,item.title,item.author);entry.desktopCoverPath=item.coverPath;entry.desktopDownloadedPictures=Math.max(entry.desktopDownloadedPictures,item.downloadedPictures);}}save(context,snapshot);return snapshot;}

    private static void applyShelfReferences(Context context,Snapshot snapshot){
        ShelfStore.Snapshot shelves=ShelfStore.load(context);if(shelves.shelves.isEmpty())return;
        for(Entry entry:snapshot.byId.values()){entry.inShelf=false;entry.shelfIds.clear();}
        for(ShelfStore.Shelf shelf:shelves.shelves)for(ShelfStore.Item item:shelf.items){Entry entry=entry(snapshot,item.comicId);basic(entry,item.title,item.author);entry.inShelf=true;if(!entry.shelfIds.contains(shelf.id))entry.shelfIds.add(shelf.id);entry.knownPictures=Math.max(entry.knownPictures,item.knownPictures);entry.desktopDownloadedPictures=Math.max(entry.desktopDownloadedPictures,item.downloadedPictures);}
    }

    private static void mergeDesktop(Snapshot snapshot,JSONObject o){
        String id=o.optString("comicId","");if(id.isEmpty())return;Entry entry=entry(snapshot,id);basic(entry,o.optString("title",entry.title),o.optString("author",entry.author));entry.canonicalAuthor=o.optString("canonicalAuthor",entry.canonicalAuthor);entry.authorId=o.optString("authorId",entry.authorId);copyIfPresent(o,"tags",entry.tags);copyIfPresent(o,"categories",entry.categories);if(o.has("finished"))entry.finished=o.optBoolean("finished",entry.finished);if(o.has("isFavorite"))entry.favorite=o.optBoolean("isFavorite",entry.favorite);entry.updatedAt=newer(entry.updatedAt,o.optString("updatedAt",o.optString("lastSeenAt","")));entry.knownPictures=Math.max(entry.knownPictures,o.optInt("knownPictures",0));entry.desktopDownloadedPictures=Math.max(0,o.optInt("downloadedPictures",0));entry.desktopAvailable=true;entry.desktopDownloaded=entry.desktopDownloadedPictures>0;entry.desktopCoverPath=o.optString("coverPath","/mobile/v1/covers/"+id);
    }

    private static void mergeRemote(Snapshot snapshot,JSONObject o){
        String id=o.optString("comicId","");if(id.isEmpty())return;Entry entry=entry(snapshot,id);basic(entry,o.optString("title",entry.title),o.optString("author",entry.author));entry.canonicalAuthor=o.optString("canonicalAuthor",entry.canonicalAuthor);entry.authorId=o.optString("authorId",entry.authorId);copyIfPresent(o,"tags",entry.tags);copyIfPresent(o,"categories",entry.categories);if(o.has("finished"))entry.finished=o.optBoolean("finished",entry.finished);if(o.has("isFavorite"))entry.favorite=o.optBoolean("isFavorite",entry.favorite);entry.updatedAt=newer(entry.updatedAt,o.optString("updatedAt",""));entry.knownPictures=Math.max(entry.knownPictures,o.optInt("knownPictures",o.optInt("pageCount",0)));entry.remotePageCount=Math.max(0,o.optInt("pageCount",0));entry.remoteAvailable=true;entry.remoteCoverPath=o.optString("coverPath","");
    }

    private static Entry entry(Snapshot snapshot,String id){Entry entry=snapshot.byId.get(id);if(entry==null){entry=new Entry(id);snapshot.byId.put(id,entry);}return entry;}
    private static void basic(Entry entry,String title,String author){if(title!=null&&!title.trim().isEmpty())entry.title=title;if(author!=null&&!author.trim().isEmpty())entry.author=author;}
    private static void copyIfPresent(JSONObject o,String key,List<String> target){if(!o.has(key))return;JSONArray arr=o.optJSONArray(key);if(arr==null)return;target.clear();for(int i=0;i<arr.length();i++){String value=arr.optString(i,"").trim();if(!value.isEmpty()&&!target.contains(value))target.add(value);}}
    private static String newer(String a,String b){String left=a==null?"":a,right=b==null?"":b;return right.compareTo(left)>0?right:left;}
    private static String safe(String value,String fallback){return value==null||value.trim().isEmpty()?fallback:value;}

    private static Entry parseEntry(JSONObject o){
        if(o==null)return null;String id=o.optString("id","");if(id.isEmpty())return null;Entry e=new Entry(id,o.optString("title","未命名漫画"),o.optString("author","未知作者"));e.canonicalAuthor=o.optString("canonicalAuthor","");e.authorId=o.optString("authorId","");e.updatedAt=o.optString("updatedAt","");e.desktopCoverPath=o.optString("desktopCoverPath","");e.remoteCoverPath=o.optString("remoteCoverPath","");readArray(o.optJSONArray("tags"),e.tags);readArray(o.optJSONArray("categories"),e.categories);readArray(o.optJSONArray("shelfIds"),e.shelfIds);e.finished=o.optBoolean("finished",false);e.favorite=o.optBoolean("favorite",false);e.inShelf=o.optBoolean("inShelf",false);e.phoneDownloaded=o.optBoolean("phoneDownloaded",false);e.desktopAvailable=o.optBoolean("desktopAvailable",false);e.desktopDownloaded=o.optBoolean("desktopDownloaded",false);e.remoteAvailable=o.optBoolean("remoteAvailable",false);e.picaAvailable=o.optBoolean("picaAvailable",false);e.knownPictures=o.optInt("knownPictures",0);e.desktopDownloadedPictures=o.optInt("desktopDownloadedPictures",0);e.remotePageCount=o.optInt("remotePageCount",0);return e;
    }
    private static void readArray(JSONArray arr,List<String> target){if(arr==null)return;for(int i=0;i<arr.length();i++){String value=arr.optString(i,"");if(!value.isEmpty())target.add(value);}}
    private static JSONObject json(Entry e) throws Exception {JSONObject o=new JSONObject();o.put("id",e.id);o.put("title",e.title);o.put("author",e.author);o.put("canonicalAuthor",e.canonicalAuthor);o.put("authorId",e.authorId);o.put("updatedAt",e.updatedAt);o.put("desktopCoverPath",e.desktopCoverPath);o.put("remoteCoverPath",e.remoteCoverPath);o.put("tags",new JSONArray(e.tags));o.put("categories",new JSONArray(e.categories));o.put("shelfIds",new JSONArray(e.shelfIds));o.put("finished",e.finished);o.put("favorite",e.favorite);o.put("inShelf",e.inShelf);o.put("phoneDownloaded",e.phoneDownloaded);o.put("desktopAvailable",e.desktopAvailable);o.put("desktopDownloaded",e.desktopDownloaded);o.put("remoteAvailable",e.remoteAvailable);o.put("picaAvailable",e.picaAvailable);o.put("knownPictures",e.knownPictures);o.put("desktopDownloadedPictures",e.desktopDownloadedPictures);o.put("remotePageCount",e.remotePageCount);return o;}
}
