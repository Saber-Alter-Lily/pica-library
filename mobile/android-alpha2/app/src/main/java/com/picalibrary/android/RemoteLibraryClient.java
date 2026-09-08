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
    RemoteLibraryClient(Context context){this(RemoteConfigStore.load(context));}
    RemoteLibraryClient(RemoteConfigStore.Config config){this.config=config;if(!config.configured())throw new IllegalStateException("尚未配置 WebDAV");}
    String scope(){try{byte[] raw=MessageDigest.getInstance("SHA-256").digest((config.baseUrl+"\n"+config.root+"\n"+config.username).getBytes(StandardCharsets.UTF_8));StringBuilder out=new StringBuilder();for(byte b:raw)out.append(String.format(Locale.ROOT,"%02x",b));return out.toString();}catch(Exception e){return config.baseUrl+"/"+config.root;}}
    private URL url(String path) throws Exception {String p=path==null?"":path.replaceAll("^/+","");return new URL(config.baseUrl+"/"+config.root+"/"+p);}
    HttpURLConnection open(String path,String accept) throws Exception {
        HttpURLConnection c=(HttpURLConnection)url(path).openConnection();c.setConnectTimeout(7000);c.setReadTimeout(30000);c.setUseCaches(true);c.setInstanceFollowRedirects(true);c.setRequestProperty("Accept",accept);
        if(!config.username.isEmpty()||!config.password.isEmpty())c.setRequestProperty("Authorization","Basic "+Base64.encodeToString((config.username+":"+config.password).getBytes(StandardCharsets.UTF_8),Base64.NO_WRAP));return c;
    }
    private String text(String path) throws Exception {HttpURLConnection c=open(path,"application/json");try{int status=c.getResponseCode();if(status==404&&path.equals("v1/control/current.json"))throw new IllegalStateException("云端书库尚未发布，请等待电脑首次同步完成");if(status>=400)throw new IllegalStateException("WebDAV HTTP "+status);try(InputStream in=c.getInputStream();ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] b=new byte[8192];int n;while((n=in.read(b))>0)out.write(b,0,n);return out.toString("UTF-8");}}finally{c.disconnect();}}
    JSONObject json(String path) throws Exception {return new JSONObject(text(path));}
    Catalog catalog() throws Exception {JSONObject pointer=json("v1/control/current.json");String generation=pointer.optString("generation","");String catalogPath=pointer.optString("catalogPath","");if(catalogPath.isEmpty())throw new IllegalStateException("云端书库尚未发布，请等待电脑首次同步完成");JSONObject root=json(catalogPath);JSONArray arr=root.optJSONArray("comics");List<Comic> list=new ArrayList<>();if(arr!=null)for(int i=0;i<arr.length();i++){JSONObject o=arr.optJSONObject(i);if(o==null)continue;list.add(new Comic(o.optString("comicId"),o.optString("title","未命名漫画"),o.optString("author","未知作者"),o.optString("manifestPath"),o.optString("coverPath"),o.optInt("episodeCount",0),o.optInt("pageCount",0)));}return new Catalog(generation,list);}
    JSONObject comic(String manifestPath) throws Exception {return json(manifestPath);}
    JSONObject episode(String manifestPath) throws Exception {return json(manifestPath);}
    Bitmap bitmap(String path) throws Exception {HttpURLConnection c=open(path,"image/*");try{int status=c.getResponseCode();if(status>=400)throw new IllegalStateException("WebDAV HTTP "+status);try(InputStream in=c.getInputStream()){Bitmap b=BitmapFactory.decodeStream(in);if(b==null)throw new IllegalStateException("图片解码失败");return b;}}finally{c.disconnect();}}
    boolean test() throws Exception {
        HttpURLConnection c=open("v1/control/current.json","application/json");
        c.setRequestMethod("GET");
        try {int s=c.getResponseCode();return s==404||(s>=200&&s<400);} finally {c.disconnect();}
    }
}
