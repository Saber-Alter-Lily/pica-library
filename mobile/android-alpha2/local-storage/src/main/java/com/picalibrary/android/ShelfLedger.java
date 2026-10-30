package com.picalibrary.android;

import android.content.Context;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.*;
import org.json.*;

/**
 * Physically shared original portable-shelves-v1.json (schema 2) store:
 * local mutations, tombstones and exact serialization. Online source/catalog
 * reconciliation remains in the installed application's ShelfStore adapter.
 */
class ShelfLedger {
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

    ShelfLedger(){}
    static final String FILE="portable-shelves-v1.json";
    static File localFile(Context context){return new File(context.getFilesDir(),FILE);}
    static String now(){return Instant.now().toString();}

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

    static Snapshot load(File file){
        File f=file;if(!f.isFile())return new Snapshot("","",new ArrayList<>());
        try(InputStream in=new FileInputStream(f);ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] b=new byte[8192];int n;while((n=in.read(b))>0)out.write(b,0,n);return fromRemote(new JSONObject(out.toString("UTF-8")));}catch(Exception e){return new Snapshot("","",new ArrayList<>());}
    }

    static synchronized void save(File file,Snapshot snapshot){
        try{snapshot.updatedAt=now();JSONObject root=json(snapshot);File target=file;target.getParentFile().mkdirs();File tmp=new File(target.getParentFile(),target.getName()+".tmp");try(OutputStream out=new FileOutputStream(tmp)){out.write(root.toString().getBytes(StandardCharsets.UTF_8));}if(target.exists()&&!target.delete())throw new IOException("replace failed");if(!tmp.renameTo(target))throw new IOException("rename failed");}catch(Exception e){throw new IllegalStateException("无法保存本地书架",e);}
    }

    static synchronized Shelf create(File file,String rawName){String name=rawName==null?"":rawName.trim();if(name.isEmpty())throw new IllegalArgumentException("书架名称不能为空");Snapshot s=load(file);for(Shelf shelf:s.activeShelves())if(shelf.name.equalsIgnoreCase(name))throw new IllegalArgumentException("已存在同名书架");String t=now();Shelf shelf=new Shelf(UUID.randomUUID().toString(),"",name,t,"",new ArrayList<>());s.shelves.add(shelf);save(file,s);return shelf;}
    static synchronized void rename(File file,String id,String rawName){String name=rawName==null?"":rawName.trim();if(name.isEmpty())throw new IllegalArgumentException("书架名称不能为空");Snapshot s=load(file);Shelf target=find(s,id);if(target==null||!target.active())throw new IllegalArgumentException("书架不存在");for(Shelf shelf:s.activeShelves())if(!shelf.id.equals(id)&&shelf.name.equalsIgnoreCase(name))throw new IllegalArgumentException("已存在同名书架");target.name=name;target.updatedAt=now();save(file,s);}
    static synchronized boolean delete(File file,String id){Snapshot s=load(file);Shelf target=find(s,id);if(target==null)return false;String t=now();target.deletedAt=t;target.updatedAt=t;save(file,s);return true;}
    static synchronized void setMembership(File file,String shelfId,Item entry,boolean desired){Snapshot s=load(file);Shelf shelf=find(s,shelfId);if(shelf==null||!shelf.active())throw new IllegalArgumentException("书架不存在");Item prior=findItem(shelf,entry.comicId);String t=now();if(desired){Item next=new Item(entry.comicId,entry.title,entry.author,entry.canonicalAuthor,new ArrayList<>(entry.tags),new ArrayList<>(entry.categories),entry.finished,entry.downloadedPictures,entry.knownPictures,t,"");replaceItem(shelf,prior,next);}else if(prior!=null){Item tombstone=new Item(prior.comicId,prior.title,prior.author,prior.canonicalAuthor,new ArrayList<>(prior.tags),new ArrayList<>(prior.categories),prior.finished,prior.downloadedPictures,prior.knownPictures,t,t);replaceItem(shelf,prior,tombstone);}shelf.updatedAt=t;save(file,s);}
    static synchronized boolean setMemberships(File file,String shelfId,Collection<Item> entries,boolean desired){Snapshot s=load(file);Shelf shelf=find(s,shelfId);if(shelf==null||!shelf.active())throw new IllegalArgumentException("书架不存在");String t=now();boolean changed=false;if(entries!=null)for(Item entry:entries){if(entry==null||entry.comicId==null||entry.comicId.isEmpty())continue;Item prior=findItem(shelf,entry.comicId);if(desired){Item next=new Item(entry.comicId,entry.title,entry.author,entry.canonicalAuthor,new ArrayList<>(entry.tags),new ArrayList<>(entry.categories),entry.finished,entry.downloadedPictures,entry.knownPictures,t,"");replaceItem(shelf,prior,next);changed=true;}else if(prior!=null&&prior.active()){Item tombstone=new Item(prior.comicId,prior.title,prior.author,prior.canonicalAuthor,new ArrayList<>(prior.tags),new ArrayList<>(prior.categories),prior.finished,prior.downloadedPictures,prior.knownPictures,t,t);replaceItem(shelf,prior,tombstone);changed=true;}}if(!changed)return false;shelf.updatedAt=t;save(file,s);return true;}
    static List<Shelf> activeForComic(File file,String comicId){List<Shelf> out=new ArrayList<>();for(Shelf shelf:load(file).activeShelves())for(Item item:shelf.items)if(item.active()&&item.comicId.equals(comicId)){out.add(shelf);break;}return out;}

    static JSONObject json(Snapshot snapshot) throws Exception {JSONObject root=new JSONObject();root.put("schemaVersion",2);root.put("updatedAt",snapshot.updatedAt);root.put("lastDesktopSyncAt",snapshot.lastDesktopSyncAt);JSONArray shelves=new JSONArray();for(Shelf shelf:snapshot.shelves){JSONObject s=new JSONObject();s.put("id",shelf.id);s.put("desktopId",shelf.desktopId);s.put("name",shelf.name);s.put("updatedAt",shelf.updatedAt);s.put("deletedAt",shelf.deletedAt);JSONArray items=new JSONArray();for(Item item:shelf.items)items.put(itemJson(item));s.put("items",items);shelves.put(s);}root.put("shelves",shelves);return root;}
    static JSONObject itemJson(Item item) throws Exception {JSONObject o=new JSONObject();o.put("comicId",item.comicId);o.put("title",item.title);o.put("author",item.author);o.put("canonicalAuthor",item.canonicalAuthor);o.put("tags",new JSONArray(item.tags));o.put("categories",new JSONArray(item.categories));o.put("finished",item.finished);o.put("downloadedPictures",item.downloadedPictures);o.put("knownPictures",item.knownPictures);o.put("updatedAt",item.updatedAt);o.put("deletedAt",item.deletedAt);return o;}
    private static Shelf find(Snapshot s,String id){for(Shelf shelf:s.shelves)if(shelf.id.equals(id))return shelf;return null;}
    private static Item findItem(Shelf shelf,String comicId){for(Item item:shelf.items)if(item.comicId.equals(comicId))return item;return null;}
    private static void replaceItem(Shelf shelf,Item prior,Item next){if(prior!=null)shelf.items.remove(prior);shelf.items.add(next);}
    static List<Item> copyItems(List<Item> items){List<Item> out=new ArrayList<>();for(Item i:items)out.add(new Item(i.comicId,i.title,i.author,i.canonicalAuthor,new ArrayList<>(i.tags),new ArrayList<>(i.categories),i.finished,i.downloadedPictures,i.knownPictures,i.updatedAt,i.deletedAt));return out;}
    static String newer(String a,String b){String x=a==null?"":a,y=b==null?"":b;return x.compareTo(y)>=0?x:y;}
    static String norm(String value){return value==null?"":value.trim().toLowerCase(Locale.ROOT);}
    private static List<String> strings(JSONArray arr){List<String> out=new ArrayList<>();if(arr!=null)for(int i=0;i<arr.length();i++){String value=arr.optString(i,"").trim();if(!value.isEmpty()&&!out.contains(value))out.add(value);}return out;}
}
