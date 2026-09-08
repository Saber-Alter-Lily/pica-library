package com.picalibrary.android;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.os.Build;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.SocketTimeoutException;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

final class BridgeClient {
    static final class ComicItem {
        final String id, title, author, coverPath;
        final int downloadedPictures;
        ComicItem(String id, String title, String author, String coverPath, int downloadedPictures) {
            this.id=id; this.title=title; this.author=author; this.coverPath=coverPath; this.downloadedPictures=downloadedPictures;
        }
    }
    static final class RecentItem {
        final ComicItem comic;
        final String episodeId, episodeTitle, updatedAt;
        final int pageIndex, episodeOrder;
        RecentItem(ComicItem comic,String episodeId,String episodeTitle,int episodeOrder,int pageIndex,String updatedAt){
            this.comic=comic;this.episodeId=episodeId;this.episodeTitle=episodeTitle;this.episodeOrder=episodeOrder;this.pageIndex=pageIndex;this.updatedAt=updatedAt;
        }
    }
    static final class ChapterItem {
        final String id, title;
        final int order, downloadedPictures;
        ChapterItem(String id, String title, int order, int downloadedPictures) {
            this.id=id; this.title=title; this.order=order; this.downloadedPictures=downloadedPictures;
        }
    }
    static final class PageItem {
        final String id, url;
        final int position;
        PageItem(String id, String url, int position) { this.id=id; this.url=url; this.position=position; }
    }
    static final class ChapterData {
        final ChapterItem episode;
        final List<PageItem> pages;
        final int progressIndex;
        ChapterData(ChapterItem episode, List<PageItem> pages, int progressIndex) {
            this.episode=episode; this.pages=pages; this.progressIndex=progressIndex;
        }
    }
    static final class RecommendationItem {
        final String id, title, author, reason;
        RecommendationItem(String id,String title,String author,String reason){this.id=id;this.title=title;this.author=author;this.reason=reason;}
    }

    private static HttpURLConnection open(String host, String path, String token, String method) throws Exception {
        URL url = new URL(host.replaceAll("/$", "") + path);
        HttpURLConnection con = (HttpURLConnection) url.openConnection();
        con.setConnectTimeout(2500);
        con.setReadTimeout(12000);
        con.setRequestMethod(method);
        con.setRequestProperty("Accept", "application/json");
        con.setUseCaches(false);
        if (token != null && !token.isEmpty()) con.setRequestProperty("Authorization", "Bearer " + token);
        return con;
    }

    private static String read(HttpURLConnection con) throws Exception {
        try {
            int status=con.getResponseCode();
            InputStream stream=status>=400?con.getErrorStream():con.getInputStream();
            if(stream==null) throw new IllegalStateException("HTTP " + status);
            BufferedReader r=new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8));
            StringBuilder b=new StringBuilder(); String line;
            while((line=r.readLine())!=null)b.append(line);
            if(status>=400) throw new IllegalStateException("HTTP " + status + ": " + b);
            return b.toString();
        } catch (SocketTimeoutException e) {
            throw new IllegalStateException("Desktop 响应超时");
        } finally {
            con.disconnect();
        }
    }

    static String get(Context c, String path) throws Exception {
        String host=BridgeStore.host(c);
        if(host.isEmpty()) throw new IllegalStateException("尚未配对 Desktop");
        return read(open(host,path,BridgeStore.token(c),"GET"));
    }

    static JSONObject device(Context c) throws Exception {
        return new JSONObject(get(c,"/mobile/v1/device"));
    }

    static String post(Context c, String path, JSONObject value) throws Exception {
        String host=BridgeStore.host(c);
        if(host.isEmpty()) throw new IllegalStateException("尚未配对 Desktop");
        HttpURLConnection con=open(host,path,BridgeStore.token(c),"POST");
        con.setDoOutput(true); con.setRequestProperty("Content-Type","application/json; charset=utf-8");
        try(OutputStream out=con.getOutputStream()){out.write(value.toString().getBytes(StandardCharsets.UTF_8));}
        return read(con);
    }

    static JSONObject pair(String host, String code) throws Exception {
        HttpURLConnection con=open(host,"/mobile/v1/pair","","POST");
        con.setDoOutput(true); con.setRequestProperty("Content-Type","application/json; charset=utf-8");
        JSONObject body=new JSONObject();
        body.put("code",code);
        body.put("deviceName",Build.MANUFACTURER+" "+Build.MODEL);
        try(OutputStream out=con.getOutputStream()){out.write(body.toString().getBytes(StandardCharsets.UTF_8));}
        return new JSONObject(read(con));
    }

    static List<ComicItem> library(Context c, String scope, int limit) throws Exception {
        return library(c,scope,limit,"","latest");
    }

    static List<ComicItem> library(Context c, String scope, int limit, String text, String sort) throws Exception {
        String path="/mobile/v1/library?scope="+enc(scope)+"&limit="+limit+"&sort="+enc(sort==null?"latest":sort);
        if(text!=null&&!text.trim().isEmpty())path+="&text="+enc(text.trim());
        JSONObject root=new JSONObject(get(c,path));
        JSONArray items=root.optJSONArray("items");
        List<ComicItem> out=new ArrayList<>();
        if(items!=null) for(int i=0;i<items.length();i++){
            JSONObject o=items.optJSONObject(i); if(o==null)continue;
            out.add(new ComicItem(
                o.optString("comicId"),
                o.optString("title","未命名漫画"),
                o.optString("author","未知作者"),
                o.optString("coverPath","/mobile/v1/covers/"+o.optString("comicId")),
                o.optInt("downloadedPictures",0)
            ));
        }
        return out;
    }

    static List<RecentItem> recent(Context c,int limit) throws Exception {
        JSONObject root=new JSONObject(get(c,"/mobile/v1/reader/recent?limit="+limit));
        JSONArray items=root.optJSONArray("items");List<RecentItem> out=new ArrayList<>();
        if(items!=null)for(int i=0;i<items.length();i++){
            JSONObject o=items.optJSONObject(i);if(o==null)continue;
            String id=o.optString("comicId");
            ComicItem comic=new ComicItem(id,o.optString("title","未命名漫画"),o.optString("author","未知作者"),o.optString("coverPath","/mobile/v1/covers/"+id),o.optInt("downloadedPictures",0));
            out.add(new RecentItem(comic,o.optString("episodeId"),o.optString("episodeTitle","章节"),o.optInt("episodeOrder",0),o.optInt("pageIndex",0),o.optString("updatedAt","")));
        }
        return out;
    }

    static List<ChapterItem> chapters(Context c,String comicId) throws Exception {
        JSONArray arr=new JSONArray(get(c,"/mobile/v1/comics/"+enc(comicId)+"/chapters"));
        List<ChapterItem> out=new ArrayList<>();
        for(int i=0;i<arr.length();i++){
            JSONObject o=arr.optJSONObject(i); if(o==null)continue;
            out.add(new ChapterItem(o.optString("id"),o.optString("title","章节"),o.optInt("order",i+1),o.optInt("downloadedPictures",0)));
        }
        return out;
    }

    static ChapterData chapter(Context c,String comicId,String episodeId) throws Exception {
        JSONObject root=new JSONObject(get(c,"/mobile/v1/comics/"+enc(comicId)+"/chapters/"+enc(episodeId)));
        JSONObject ep=root.optJSONObject("episode");
        ChapterItem episode=new ChapterItem(ep==null?episodeId:ep.optString("id",episodeId),ep==null?"章节":ep.optString("title","章节"),ep==null?0:ep.optInt("order",0),ep==null?0:ep.optInt("downloadedPictures",0));
        JSONArray arr=root.optJSONArray("pages"); List<PageItem> pages=new ArrayList<>();
        if(arr!=null) for(int i=0;i<arr.length();i++){
            JSONObject o=arr.optJSONObject(i); if(o==null)continue;
            pages.add(new PageItem(o.optString("id"),o.optString("url"),o.optInt("position",i+1)));
        }
        JSONObject progress=root.optJSONObject("progress");
        return new ChapterData(episode,pages,progress==null?0:Math.max(0,progress.optInt("pageIndex",0)));
    }

    static Bitmap bitmap(Context c,String relative) throws Exception {
        String host=BridgeStore.host(c); if(host.isEmpty())throw new IllegalStateException("尚未配对 Desktop");
        HttpURLConnection con=open(host,relative,BridgeStore.token(c),"GET");
        con.setReadTimeout(15000);
        con.setRequestProperty("Accept","image/*");
        try {
            int status=con.getResponseCode(); if(status>=400)throw new IllegalStateException("HTTP "+status);
            try(InputStream in=con.getInputStream()){
                Bitmap bitmap=BitmapFactory.decodeStream(in);
                if(bitmap==null)throw new IllegalStateException("图片解码失败");
                return bitmap;
            }
        } catch (SocketTimeoutException e) {
            throw new IllegalStateException("图片读取超时");
        } finally {
            con.disconnect();
        }
    }

    static void saveProgress(Context c,String comicId,String episodeId,int pageIndex){
        new Thread(()->{try{
            JSONObject body=new JSONObject(); body.put("comicId",comicId); body.put("episodeId",episodeId); body.put("pageIndex",pageIndex);
            post(c,"/mobile/v1/reader/progress",body);
        }catch(Exception ignored){}}).start();
    }

    static List<RecommendationItem> recommendations(Context c,int limit) throws Exception {
        JSONObject root=new JSONObject(get(c,"/mobile/v1/recommendations?limit="+limit));
        JSONArray arr=root.optJSONArray("recommendations"); List<RecommendationItem> out=new ArrayList<>();
        if(arr!=null) for(int i=0;i<arr.length();i++){
            JSONObject o=arr.optJSONObject(i); if(o==null)continue;
            JSONObject comic=o.optJSONObject("comic"); if(comic==null)comic=o;
            JSONArray reasons=o.optJSONArray("reasons"); String reason="为你推荐";
            if(reasons!=null&&reasons.length()>0)reason=reasons.optString(0,reason);
            out.add(new RecommendationItem(comic.optString("comicId"),comic.optString("title","未命名漫画"),comic.optString("author","未知作者"),reason));
        }
        return out;
    }

    static JSONObject atlas(Context c) throws Exception { return new JSONObject(get(c,"/mobile/v1/atlas")); }

    private static String enc(String value) throws Exception { return java.net.URLEncoder.encode(value==null?"":value,"UTF-8").replace("+","%20"); }
}
