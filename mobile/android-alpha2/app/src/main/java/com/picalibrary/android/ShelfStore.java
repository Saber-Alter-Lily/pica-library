package com.picalibrary.android;

import android.content.Context;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.*;
import org.json.*;

/** Local-first portable shelves with Desktop reconciliation and deletion tombstones. */
final class ShelfStore {
    static final class Item {
        final String comicId,title,author,canonicalAuthor,updatedAt,deletedAt;
        final List<String> tags,categories;
        final boolean finished;
        final int downloadedPictures,knownPictures;
        Item(String comicId,String title,String author,String canonicalAuthor,List<String> tags,List<String> categories,boolean finished,int downloadedPictures,int knownPictures,String updatedAt){this(comicId,title,author,canonicalAuthor,tags,categories,finished,downloadedPictures,knownPictures,updatedAt,"");}
        Item(String comicId,String title,String author,String canonicalAuthor,List<String> tags,List<String> categories,boolean finished,int downloadedPictures,int knownPictures,String updatedAt,String deletedAt){this.comicId=comicId;this.title=title;this.author=author;this.canonicalAuthor=canonicalAuthor;this.tags=tags;this.categories=categories;this.finished=finished;this.downloadedPictures=downloadedPictures;this.knownPictures=knownPictures;this.updatedAt=updatedAt;this.deletedAt=deletedAt==null?"":deletedAt;}
        String displayAuthor(){return canonicalAuthor==null||canonicalAuthor.isEmpty()?author:canonicalAuthor;}
        boolean active(){return deletedAt==null||deletedAt.isEmpty();}
    }
    static final class Shelf {
        final String id;String desktopId,name,updatedAt,deletedAt;final List<Item> items;
        Shelf(String id,String name,List<Item> items){this(id,"",name,Instant.now().toString(),"",items);}
        Shelf(String id,String desktopId,String name,String updatedAt,String deletedAt,List<Item> items){this.id=id;this.desktopId=desktopId==null?"":desktopId;this.name=name;this.updatedAt=updatedAt==null?"":updatedAt;this.deletedAt=deletedAt==null?"":deletedAt;this.items=items;}
        boolean active(){return deletedAt.isEmpty();}
        List<Item> activeItems(){List<Item> out=new ArrayList<>();for(Item item:items)if(item.active())out.add(item);return out;}
    }
    static final class Snapshot {
        String updatedAt,lastDesktopSyncAt;final List<Shelf> shelves;
        Snapshot(String updatedAt,List<Shelf> shelves){this(updatedAt,"",shelves);}
        Snapshot(String updatedAt,String lastDesktopSyncAt,List<Shelf> shelves){this.updatedAt=updatedAt==null?"":updatedAt;this.lastDesktopSyncAt=lastDesktopSyncAt==null?"":lastDesktopSyncAt;this.shelves=shelves;}
        List<Shelf> activeShelves(){List<Shelf> out=new ArrayList<>();for(Shelf shelf:shelves)if(shelf.active())out.add(shelf);out.sort(Comparator.comparing(a->a.name.toLowerCase(Locale.ROOT)));return out;}
    }

    private ShelfStore(){}
    private static File file(Context context){return MobileStoragePaths.dataFile(context,"portable-shelves-v1.json");}
    private static String now(){return Instant.now().toString();}

    static Snapshot fromRemote(JSONObject root){
        List<Shelf> shelves=new ArrayList<>();JSONArray shelfArray=root.optJSONArray("shelves");
        if(shelfArray!=null)for(int i=0;i<shelfArray.length();i++){
            JSONObject s=shelfArray.optJSONObject(i);if(s==null)continue;List<Item> items=new ArrayList<>();JSONArray arr=s.optJSONArray("items");
            if(arr!=null)for(int j=0;j<arr.length();j++){
                JSONObject o=arr.optJSONObject(j);if(o==null)continue;String comicId=o.optString("comicId","");if(comicId.isEmpty())continue;
                items.add(new Item(comicId,o.optString("title","未命名漫画"),o.optString("author","未知作者"),o.optString("canonicalAuthor",""),strings(o.optJSONArray("tags")),strings(o.optJSONArray("categories")),o.optBoolean("finished",false),o.optInt("downloadedPictures",0),o.optInt("knownPictures",0),o.optString("updatedAt",o.optString("addedAt","")),o.optString("deletedAt","")));
            }
            String id=s.optString("id","shelf-"+i),desktop=s.optString("desktopId",s.optString("desktopShelfId",id));String updated=s.optString("updatedAt",root.optString("updatedAt",""));shelves.add(new Shelf(id,desktop,s.optString("name","书架"),updated,s.optString("deletedAt",""),items));
        }
        return new Snapshot(root.optString("updatedAt",""),root.optString("lastDesktopSyncAt",""),shelves);
    }

    static Snapshot syncFromDesktop(Context context) throws Exception {return syncWithDesktop(context);}

    static Snapshot load(Context context){
        File f=file(context);if(!f.isFile())return new Snapshot("","",new ArrayList<>());
        try(InputStream in=new FileInputStream(f);ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] b=new byte[8192];int n;while((n=in.read(b))>0)out.write(b,0,n);return fromRemote(new JSONObject(out.toString("UTF-8")));}catch(Exception e){return new Snapshot("","",new ArrayList<>());}
    }

    static synchronized void save(Context context,Snapshot snapshot){
        try{snapshot.updatedAt=now();JSONObject root=json(snapshot);File target=file(context);target.getParentFile().mkdirs();File tmp=new File(target.getParentFile(),target.getName()+".tmp");try(OutputStream out=new FileOutputStream(tmp)){out.write(root.toString().getBytes(StandardCharsets.UTF_8));}if(target.exists()&&!target.delete())throw new IOException("replace failed");if(!tmp.renameTo(target))throw new IOException("rename failed");UnifiedCatalogStore.reconcileLocalReferences(context);mergeRichMetadata(context,snapshot);}catch(Exception e){throw new IllegalStateException("无法保存本地书架",e);}
    }

    static synchronized Shelf create(Context context,String rawName){String name=rawName==null?"":rawName.trim();if(name.isEmpty())throw new IllegalArgumentException("书架名称不能为空");Snapshot s=load(context);for(Shelf shelf:s.activeShelves())if(shelf.name.equalsIgnoreCase(name))throw new IllegalArgumentException("已存在同名书架");String t=now();Shelf shelf=new Shelf(UUID.randomUUID().toString(),"",name,t,"",new ArrayList<>());s.shelves.add(shelf);save(context,s);return shelf;}
    static synchronized void rename(Context context,String id,String rawName){String name=rawName==null?"":rawName.trim();if(name.isEmpty())throw new IllegalArgumentException("书架名称不能为空");Snapshot s=load(context);Shelf target=find(s,id);if(target==null||!target.active())throw new IllegalArgumentException("书架不存在");for(Shelf shelf:s.activeShelves())if(!shelf.id.equals(id)&&shelf.name.equalsIgnoreCase(name))throw new IllegalArgumentException("已存在同名书架");target.name=name;target.updatedAt=now();save(context,s);}
    static synchronized void delete(Context context,String id){Snapshot s=load(context);Shelf target=find(s,id);if(target==null)return;String t=now();target.deletedAt=t;target.updatedAt=t;save(context,s);}
    static synchronized void setMembership(Context context,String shelfId,UnifiedCatalogStore.Entry entry,boolean desired){Snapshot s=load(context);Shelf shelf=find(s,shelfId);if(shelf==null||!shelf.active())throw new IllegalArgumentException("书架不存在");Item prior=findItem(shelf,entry.id);String t=now();if(desired){Item next=itemFromEntry(entry,t,"");replaceItem(shelf,prior,next);}else if(prior!=null){Item tombstone=new Item(prior.comicId,prior.title,prior.author,prior.canonicalAuthor,new ArrayList<>(prior.tags),new ArrayList<>(prior.categories),prior.finished,prior.downloadedPictures,prior.knownPictures,t,t);replaceItem(shelf,prior,tombstone);}shelf.updatedAt=t;save(context,s);}
    static List<Shelf> activeForComic(Context context,String comicId){List<Shelf> out=new ArrayList<>();for(Shelf shelf:load(context).activeShelves())for(Item item:shelf.items)if(item.active()&&item.comicId.equals(comicId)){out.add(shelf);break;}return out;}

    static synchronized Snapshot syncWithDesktop(Context context) throws Exception {
        if(!BridgeStore.paired(context))throw new IllegalStateException("尚未配对 Desktop");
        Snapshot local=load(context);JSONObject remoteRoot=BridgeClient.shelves(context);Snapshot remote=fromRemote(remoteRoot);String last=local.lastDesktopSyncAt;Map<String,Shelf> remoteById=new LinkedHashMap<>();Map<String,Shelf> remoteByName=new LinkedHashMap<>();for(Shelf r:remote.activeShelves()){remoteById.put(r.desktopId.isEmpty()?r.id:r.desktopId,r);remoteByName.put(norm(r.name),r);}Set<String> matched=new HashSet<>();
        for(Shelf l:new ArrayList<>(local.shelves)){
            String desktopId=l.desktopId;Shelf r=desktopId.isEmpty()?remoteByName.get(norm(l.name)):remoteById.get(desktopId);
            if(!l.active()){
                if(r!=null&&!l.deletedAt.isEmpty()&&newer(l.deletedAt,r.updatedAt).equals(l.deletedAt)){BridgeClient.shelfMutate(context,"delete",r.desktopId.isEmpty()?r.id:r.desktopId,"",Collections.emptyList(),new JSONArray());matched.add(r.desktopId.isEmpty()?r.id:r.desktopId);}continue;
            }
            // A previously synced Desktop shelf disappearing remotely is a Desktop-side delete,
            // unless the phone edited that shelf after the last successful reconciliation.
            if(r==null&&!desktopId.isEmpty()&&!last.isEmpty()&&l.updatedAt.compareTo(last)<=0){String t=now();l.deletedAt=t;l.updatedAt=t;continue;}
            if(r==null){
                JSONObject created=BridgeClient.shelfMutate(context,"create","",l.name,Collections.emptyList(),new JSONArray());desktopId=created.optString("id","");if(desktopId.isEmpty())throw new IOException("Desktop 未返回书架 ID");l.desktopId=desktopId;l.updatedAt=now();r=new Shelf(desktopId,desktopId,l.name,l.updatedAt,"",new ArrayList<>());remoteById.put(desktopId,r);
            }else{desktopId=r.desktopId.isEmpty()?r.id:r.desktopId;l.desktopId=desktopId;}
            matched.add(desktopId);boolean localChanged=last.isEmpty()||l.updatedAt.compareTo(last)>0;boolean remoteChanged=last.isEmpty()||r.updatedAt.compareTo(last)>0;
            if(remoteChanged&&!localChanged){l.name=r.name;l.updatedAt=r.updatedAt;}else if(localChanged&&!l.name.equals(r.name)){BridgeClient.shelfMutate(context,"rename",desktopId,l.name,Collections.emptyList(),new JSONArray());}
            mergeMembership(context,l,r,last,localChanged,remoteChanged);
        }
        for(Shelf r:remote.activeShelves()){String rid=r.desktopId.isEmpty()?r.id:r.desktopId;if(matched.contains(rid))continue;Shelf imported=new Shelf(rid,rid,r.name,r.updatedAt,"",copyItems(r.items));local.shelves.add(imported);}
        local.lastDesktopSyncAt=now();save(context,local);return load(context);
    }

    private static void mergeMembership(Context context,Shelf local,Shelf remote,String last,boolean localChanged,boolean remoteChanged) throws Exception {
        Map<String,Item> localMap=new LinkedHashMap<>(),remoteMap=new LinkedHashMap<>();for(Item i:local.items)localMap.put(i.comicId,i);for(Item i:remote.items)if(i.active())remoteMap.put(i.comicId,i);
        if(remoteChanged&&!localChanged){local.items.clear();local.items.addAll(copyItems(remote.items));return;}
        LinkedHashSet<String> desired=new LinkedHashSet<>(remoteMap.keySet());for(Item i:local.items)if(i.active())desired.add(i.comicId);for(Item i:local.items)if(!i.active()&&(last.isEmpty()||i.deletedAt.compareTo(last)>0))desired.remove(i.comicId);
        List<String> add=new ArrayList<>(),remove=new ArrayList<>();JSONArray records=new JSONArray();for(String id:desired)if(!remoteMap.containsKey(id)){add.add(id);Item item=localMap.get(id);if(item!=null)records.put(itemJson(item));}for(String id:remoteMap.keySet())if(!desired.contains(id))remove.add(id);
        String desktopId=local.desktopId;if(!add.isEmpty())BridgeClient.shelfMutate(context,"add",desktopId,"",add,records);if(!remove.isEmpty())BridgeClient.shelfMutate(context,"remove",desktopId,"",remove,new JSONArray());
        List<Item> merged=new ArrayList<>();for(String id:desired){Item item=localMap.get(id);if(item==null)item=remoteMap.get(id);if(item!=null)merged.add(new Item(item.comicId,item.title,item.author,item.canonicalAuthor,new ArrayList<>(item.tags),new ArrayList<>(item.categories),item.finished,item.downloadedPictures,item.knownPictures,item.updatedAt,""));}for(Item i:local.items)if(!i.active())merged.add(i);local.items.clear();local.items.addAll(merged);local.updatedAt=now();
    }

    static JSONObject json(Snapshot snapshot) throws Exception {JSONObject root=new JSONObject();root.put("schemaVersion",2);root.put("updatedAt",snapshot.updatedAt);root.put("lastDesktopSyncAt",snapshot.lastDesktopSyncAt);JSONArray shelves=new JSONArray();for(Shelf shelf:snapshot.shelves){JSONObject s=new JSONObject();s.put("id",shelf.id);s.put("desktopId",shelf.desktopId);s.put("name",shelf.name);s.put("updatedAt",shelf.updatedAt);s.put("deletedAt",shelf.deletedAt);JSONArray items=new JSONArray();for(Item item:shelf.items)items.put(itemJson(item));s.put("items",items);shelves.put(s);}root.put("shelves",shelves);return root;}
    private static JSONObject itemJson(Item item) throws Exception {JSONObject o=new JSONObject();o.put("comicId",item.comicId);o.put("title",item.title);o.put("author",item.author);o.put("canonicalAuthor",item.canonicalAuthor);o.put("tags",new JSONArray(item.tags));o.put("categories",new JSONArray(item.categories));o.put("finished",item.finished);o.put("downloadedPictures",item.downloadedPictures);o.put("knownPictures",item.knownPictures);o.put("updatedAt",item.updatedAt);o.put("deletedAt",item.deletedAt);return o;}
    private static Item itemFromEntry(UnifiedCatalogStore.Entry e,String updated,String deleted){return new Item(e.id,e.title,e.author,e.canonicalAuthor,new ArrayList<>(e.tags),new ArrayList<>(e.categories),e.finished,e.desktopDownloadedPictures,e.knownPictures,updated,deleted);}
    private static Shelf find(Snapshot s,String id){for(Shelf shelf:s.shelves)if(shelf.id.equals(id))return shelf;return null;}
    private static Item findItem(Shelf shelf,String comicId){for(Item item:shelf.items)if(item.comicId.equals(comicId))return item;return null;}
    private static void replaceItem(Shelf shelf,Item prior,Item next){if(prior!=null)shelf.items.remove(prior);shelf.items.add(next);}
    private static List<Item> copyItems(List<Item> items){List<Item> out=new ArrayList<>();for(Item i:items)out.add(new Item(i.comicId,i.title,i.author,i.canonicalAuthor,new ArrayList<>(i.tags),new ArrayList<>(i.categories),i.finished,i.downloadedPictures,i.knownPictures,i.updatedAt,i.deletedAt));return out;}
    private static String newer(String a,String b){String x=a==null?"":a,y=b==null?"":b;return x.compareTo(y)>=0?x:y;}
    private static String norm(String value){return value==null?"":value.trim().toLowerCase(Locale.ROOT);}

    private static void mergeRichMetadata(Context context,Snapshot snapshot){UnifiedCatalogStore.Snapshot catalog=UnifiedCatalogStore.load(context);for(Shelf shelf:snapshot.shelves)if(shelf.active())for(Item item:shelf.items)if(item.active()){UnifiedCatalogStore.Entry entry=catalog.byId.get(item.comicId);if(entry==null){entry=new UnifiedCatalogStore.Entry(item.comicId,item.title,item.author);catalog.byId.put(item.comicId,entry);}if(item.title!=null&&!item.title.isEmpty())entry.title=item.title;if(item.author!=null&&!item.author.isEmpty())entry.author=item.author;if(item.canonicalAuthor!=null&&!item.canonicalAuthor.isEmpty())entry.canonicalAuthor=item.canonicalAuthor;if(!item.tags.isEmpty()){entry.tags.clear();entry.tags.addAll(item.tags);}if(!item.categories.isEmpty()){entry.categories.clear();entry.categories.addAll(item.categories);}entry.finished=item.finished;entry.knownPictures=Math.max(entry.knownPictures,item.knownPictures);if(item.updatedAt!=null&&item.updatedAt.compareTo(entry.updatedAt==null?"":entry.updatedAt)>0)entry.updatedAt=item.updatedAt;}UnifiedCatalogStore.save(context,catalog);}
    private static List<String> strings(JSONArray arr){List<String> out=new ArrayList<>();if(arr!=null)for(int i=0;i<arr.length();i++){String value=arr.optString(i,"").trim();if(!value.isEmpty()&&!out.contains(value))out.add(value);}return out;}
}
