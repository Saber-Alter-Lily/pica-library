package com.picalibrary.android;

import android.content.Context;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import org.json.*;

/** Portable bookshelf metadata cached locally. Desktop remains the current editing authority. */
final class ShelfStore {
    static final class Item {
        final String comicId,title,author;
        final int downloadedPictures,knownPictures;
        Item(String comicId,String title,String author,int downloadedPictures,int knownPictures){this.comicId=comicId;this.title=title;this.author=author;this.downloadedPictures=downloadedPictures;this.knownPictures=knownPictures;}
    }
    static final class Shelf {
        final String id,name;
        final List<Item> items;
        Shelf(String id,String name,List<Item> items){this.id=id;this.name=name;this.items=items;}
    }
    static final class Snapshot {
        final String updatedAt;
        final List<Shelf> shelves;
        Snapshot(String updatedAt,List<Shelf> shelves){this.updatedAt=updatedAt;this.shelves=shelves;}
    }

    private ShelfStore(){}
    private static File file(Context context){return new File(context.getFilesDir(),"portable-shelves-v1.json");}

    static Snapshot fromRemote(JSONObject root){
        List<Shelf> shelves=new ArrayList<>();JSONArray shelfArray=root.optJSONArray("shelves");
        if(shelfArray!=null)for(int i=0;i<shelfArray.length();i++){
            JSONObject s=shelfArray.optJSONObject(i);if(s==null)continue;List<Item> items=new ArrayList<>();JSONArray arr=s.optJSONArray("items");
            if(arr!=null)for(int j=0;j<arr.length();j++){
                JSONObject o=arr.optJSONObject(j);if(o==null)continue;String comicId=o.optString("comicId","");if(comicId.isEmpty())continue;
                items.add(new Item(comicId,o.optString("title","未命名漫画"),o.optString("canonicalAuthor",o.optString("author","未知作者")),o.optInt("downloadedPictures",0),o.optInt("knownPictures",0)));
            }
            shelves.add(new Shelf(s.optString("id","shelf-"+i),s.optString("name","书架"),items));
        }
        return new Snapshot(root.optString("updatedAt",""),shelves);
    }

    static Snapshot load(Context context){
        File f=file(context);if(!f.isFile())return new Snapshot("",new ArrayList<>());
        try(InputStream in=new FileInputStream(f);ByteArrayOutputStream out=new ByteArrayOutputStream()){
            byte[] b=new byte[8192];int n;while((n=in.read(b))>0)out.write(b,0,n);return fromRemote(new JSONObject(out.toString("UTF-8")));
        }catch(Exception e){return new Snapshot("",new ArrayList<>());}
    }

    static void save(Context context,Snapshot snapshot){
        try{
            JSONObject root=new JSONObject();root.put("schemaVersion",1);root.put("updatedAt",snapshot.updatedAt);JSONArray shelves=new JSONArray();
            for(Shelf shelf:snapshot.shelves){JSONObject s=new JSONObject();s.put("id",shelf.id);s.put("name",shelf.name);JSONArray items=new JSONArray();for(Item item:shelf.items){JSONObject o=new JSONObject();o.put("comicId",item.comicId);o.put("title",item.title);o.put("author",item.author);o.put("canonicalAuthor",item.author);o.put("downloadedPictures",item.downloadedPictures);o.put("knownPictures",item.knownPictures);items.put(o);}s.put("items",items);shelves.put(s);}root.put("shelves",shelves);
            File target=file(context),tmp=new File(target.getParentFile(),target.getName()+".tmp");try(OutputStream out=new FileOutputStream(tmp)){out.write(root.toString().getBytes(StandardCharsets.UTF_8));}
            if(target.exists()&&!target.delete())throw new IOException("replace failed");if(!tmp.renameTo(target))throw new IOException("rename failed");
        }catch(Exception e){throw new IllegalStateException("无法保存本地书架",e);}
    }
}
