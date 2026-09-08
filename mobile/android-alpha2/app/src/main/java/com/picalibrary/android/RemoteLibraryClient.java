package com.picalibrary.android;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.util.Base64;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;
import org.json.*;

/** WebDAV catalog client with persistent metadata/cover fallback for previously visited content. */
final class RemoteLibraryClient {
    static final class Comic {
        final String id,title,author,manifestPath,coverPath;
        final int episodeCount,pageCount;
        Comic(String id,String title,String author,String manifest,String cover,int episodes,int pages){this.id=id;this.title=title;this.author=author;this.manifestPath=manifest;this.coverPath=cover;this.episodeCount=episodes;this.pageCount=pages;}
    }
    static final class Catalog {
        final String generation;final List<Comic> comics;
        Catalog(String generation,List<Comic> comics){this.generation=generation;this.comics=comics;}
    }

    private final RemoteConfigStore.Config config;
    private final File metadataCache;
    private final File coverCache;

    RemoteLibraryClient(Context context){
        this.config=RemoteConfigStore.load(context);
        if(!config.configured())throw new IllegalStateException("尚未配置 WebDAV");
        String scope=scope();
        metadataCache=new File(context.getFilesDir(),"remote-metadata-v1/"+scope);
        coverCache=new File(context.getFilesDir(),"remote-covers-v1/"+scope);
        metadataCache.mkdirs();coverCache.mkdirs();
    }
    RemoteLibraryClient(RemoteConfigStore.Config config){
        this.config=config;if(!config.configured())throw new IllegalStateException("尚未配置 WebDAV");
        metadataCache=null;coverCache=null;
    }

    String scope(){try{byte[] raw=MessageDigest.getInstance("SHA-256").digest((config.baseUrl+"\n"+config.root+"\n"+config.username).getBytes(StandardCharsets.UTF_8));StringBuilder out=new StringBuilder();for(byte b:raw)out.append(String.format(Locale.ROOT,"%02x",b));return out.toString();}catch(Exception e){return ReaderPolicy.hash(config.baseUrl+"/"+config.root);}}
    private URL url(String path) throws Exception {String p=path==null?"":path.replaceAll("^/+","");return new URL(config.baseUrl+"/"+config.root+"/"+p);}
    HttpURLConnection open(String path,String accept) throws Exception {
        HttpURLConnection c=(HttpURLConnection)url(path).openConnection();c.setConnectTimeout(7000);c.setReadTimeout(30000);c.setUseCaches(false);c.setInstanceFollowRedirects(true);c.setRequestProperty("Accept",accept);
        if(!config.username.isEmpty()||!config.password.isEmpty())c.setRequestProperty("Authorization","Basic "+Base64.encodeToString((config.username+":"+config.password).getBytes(StandardCharsets.UTF_8),Base64.NO_WRAP));return c;
    }

    private File cached(File root,String path){return root==null?null:new File(root,ReaderPolicy.hash(path));}
    private String readFile(File file) throws Exception {try(InputStream in=new FileInputStream(file);ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] b=new byte[8192];int n;while((n=in.read(b))>0)out.write(b,0,n);return out.toString("UTF-8");}}
    private void writeFile(File target,byte[] data) throws Exception {if(target==null)return;File tmp=File.createTempFile("remote-",".tmp",target.getParentFile());try(OutputStream out=new FileOutputStream(tmp)){out.write(data);}if(target.exists()&&!target.delete())throw new IOException("cache replace failed");if(!tmp.renameTo(target))throw new IOException("cache rename failed");}

    private String text(String path) throws Exception {
        File cached=cached(metadataCache,path);
        HttpURLConnection c=null;
        try{
            c=open(path,"application/json");int status=c.getResponseCode();
            if(status==401||status==403)throw new IllegalStateException("WebDAV 认证失败 · HTTP "+status);
            if(status==404)throw new IllegalStateException("WebDAV HTTP 404");
            if(status>=400)throw new IOException("WebDAV HTTP "+status);
            try(InputStream in=c.getInputStream();ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] b=new byte[8192];int n;while((n=in.read(b))>0)out.write(b,0,n);byte[] data=out.toByteArray();writeFile(cached,data);return new String(data,StandardCharsets.UTF_8);}
        }catch(IllegalStateException e){throw e;}
        catch(Exception e){if(cached!=null&&cached.isFile())return readFile(cached);throw e;}
        finally{if(c!=null)c.disconnect();}
    }

    JSONObject json(String path) throws Exception {return new JSONObject(text(path));}
    Catalog catalog() throws Exception {
        JSONObject pointer=json("v1/control/current.json");String generation=pointer.optString("generation","");String catalogPath=pointer.optString("catalogPath","");if(catalogPath.isEmpty())throw new IllegalStateException("云端书库尚未发布");
        JSONObject root=json(catalogPath);JSONArray arr=root.optJSONArray("comics");List<Comic> list=new ArrayList<>();if(arr!=null)for(int i=0;i<arr.length();i++){JSONObject o=arr.optJSONObject(i);if(o==null)continue;list.add(new Comic(o.optString("comicId"),o.optString("title","未命名漫画"),o.optString("author","未知作者"),o.optString("manifestPath"),o.optString("coverPath"),o.optInt("episodeCount",0),o.optInt("pageCount",0)));}return new Catalog(generation,list);
    }
    JSONObject shelves() throws Exception {return json("v1/state/shelves.json");}
    JSONObject comic(String manifestPath) throws Exception {return json(manifestPath);}
    JSONObject episode(String manifestPath) throws Exception {return json(manifestPath);}

    Bitmap bitmap(String path) throws Exception {
        if(path==null||path.isEmpty())throw new IllegalStateException("没有封面路径");File target=cached(coverCache,path);
        if(target!=null&&target.isFile()){Bitmap hit=BitmapFactory.decodeFile(target.getPath());if(hit!=null){target.setLastModified(System.currentTimeMillis());return hit;}target.delete();}
        HttpURLConnection c=null;
        try{
            c=open(path,"image/*");int status=c.getResponseCode();if(status>=400)throw new IOException("WebDAV HTTP "+status);
            try(InputStream in=c.getInputStream();ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] b=new byte[16384];int n;long bytes=0;while((n=in.read(b))>0){bytes+=n;if(bytes>32L*1024*1024)throw new IOException("cover too large");out.write(b,0,n);}byte[] data=out.toByteArray();Bitmap bitmap=BitmapFactory.decodeByteArray(data,0,data.length);if(bitmap==null)throw new IOException("图片解码失败");writeFile(target,data);return bitmap;}
        }catch(Exception e){if(target!=null&&target.isFile()){Bitmap hit=BitmapFactory.decodeFile(target.getPath());if(hit!=null)return hit;}throw e;}
        finally{if(c!=null)c.disconnect();}
    }

    boolean test() throws Exception {
        HttpURLConnection c=open("v1/control/current.json","application/json");c.setRequestMethod("GET");
        try{int s=c.getResponseCode();return s==404||(s>=200&&s<400);}finally{c.disconnect();}
    }
}
