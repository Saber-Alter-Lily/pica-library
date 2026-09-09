package com.picalibrary.android;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.util.Base64;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.*;
import javax.net.ssl.SSLException;
import org.json.*;

/** WebDAV catalog client with persistent metadata/cover fallback and portable reading state. */
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

    private static final String READING_PATH="v1/state/reading/current.json";
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
        HttpURLConnection c=(HttpURLConnection)url(path).openConnection();c.setConnectTimeout(9000);c.setReadTimeout(30000);c.setUseCaches(false);c.setInstanceFollowRedirects(true);c.setRequestProperty("Accept",accept);
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

    private JSONObject optionalJson(String path) throws Exception {
        File local=cached(metadataCache,path);HttpURLConnection c=null;
        try{
            c=open(path,"application/json");int status=c.getResponseCode();
            if(status==404)return null;
            if(status==401||status==403)throw new IllegalStateException("WebDAV 认证失败 · HTTP "+status);
            if(status>=400)throw new IOException("WebDAV HTTP "+status);
            try(InputStream in=c.getInputStream();ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] b=new byte[8192];int n;while((n=in.read(b))>0)out.write(b,0,n);byte[] data=out.toByteArray();writeFile(local,data);return new JSONObject(new String(data,StandardCharsets.UTF_8));}
        }catch(IllegalStateException e){throw e;}
        catch(Exception e){if(local!=null&&local.isFile())return new JSONObject(readFile(local));throw e;}
        finally{if(c!=null)c.disconnect();}
    }

    private void putJson(String path,JSONObject value) throws Exception {
        byte[] data=value.toString().getBytes(StandardCharsets.UTF_8);HttpURLConnection c=null;
        try{
            c=open(path,"application/json");c.setRequestMethod("PUT");c.setDoOutput(true);c.setRequestProperty("Content-Type","application/json; charset=utf-8");c.setFixedLengthStreamingMode(data.length);
            try(OutputStream out=c.getOutputStream()){out.write(data);}
            int status=c.getResponseCode();
            if(status==401||status==403)throw new IllegalStateException("WebDAV 认证失败 · HTTP "+status);
            if(status==409)throw new IllegalStateException("云端状态目录尚未初始化 · 请先在新版电脑端执行一次云同步");
            if(status<200||status>=300)throw new IOException("WebDAV PUT failed · HTTP "+status);
            writeFile(cached(metadataCache,path),data);
        }finally{if(c!=null)c.disconnect();}
    }

    JSONObject json(String path) throws Exception {return new JSONObject(text(path));}
    Catalog catalog() throws Exception {
        JSONObject pointer=json("v1/control/current.json");String generation=pointer.optString("generation","");String catalogPath=pointer.optString("catalogPath","");if(catalogPath.isEmpty())throw new IllegalStateException("云端书库尚未发布");
        JSONObject root=json(catalogPath);JSONArray arr=root.optJSONArray("comics");List<Comic> list=new ArrayList<>();if(arr!=null)for(int i=0;i<arr.length();i++){JSONObject o=arr.optJSONObject(i);if(o==null)continue;list.add(new Comic(o.optString("comicId"),o.optString("title","未命名漫画"),o.optString("author","未知作者"),o.optString("manifestPath"),o.optString("coverPath"),o.optInt("episodeCount",0),o.optInt("pageCount",0)));}return new Catalog(generation,list);
    }
    JSONObject shelves() throws Exception {return json("v1/state/shelves.json");}
    JSONObject favorites() throws Exception {return json("v1/state/favorites.json");}
    JSONObject comic(String manifestPath) throws Exception {return json(manifestPath);}
    JSONObject episode(String manifestPath) throws Exception {return json(manifestPath);}

    private JSONObject readingState() throws Exception {
        JSONObject state=optionalJson(READING_PATH);
        if(state!=null)return state;
        JSONObject empty=new JSONObject();empty.put("schemaVersion",1);empty.put("updatedAt","");empty.put("entries",new JSONArray());return empty;
    }

    int progress(String comicId,String episodeId) throws Exception {
        JSONArray entries=readingState().optJSONArray("entries");int page=0;String latest="";
        if(entries!=null)for(int i=0;i<entries.length();i++){
            JSONObject e=entries.optJSONObject(i);if(e==null||!comicId.equals(e.optString("comicId"))||!episodeId.equals(e.optString("episodeId")))continue;
            String updated=e.optString("updatedAt","");if(updated.compareTo(latest)>=0){latest=updated;page=Math.max(0,e.optInt("pageIndex",0));}
        }
        return page;
    }

    String recentChapter(String comicId) throws Exception {
        JSONArray entries=readingState().optJSONArray("entries");String chapter="",latest="";
        if(entries!=null)for(int i=0;i<entries.length();i++){
            JSONObject e=entries.optJSONObject(i);if(e==null||!comicId.equals(e.optString("comicId")))continue;String updated=e.optString("updatedAt","");
            if(updated.compareTo(latest)>0){latest=updated;chapter=e.optString("episodeId","");}
        }
        return chapter;
    }

    synchronized void saveReadingProgress(String deviceId,String comicId,String episodeId,int pageIndex) {
        try{
            JSONObject state=readingState();JSONArray existing=state.optJSONArray("entries");LinkedHashMap<String,JSONObject> merged=new LinkedHashMap<>();
            if(existing!=null)for(int i=0;i<existing.length();i++){JSONObject e=existing.optJSONObject(i);if(e==null)continue;String c=e.optString("comicId","");String ep=e.optString("episodeId","");if(c.isEmpty()||ep.isEmpty())continue;merged.put(c+"\n"+ep,e);}
            String key=comicId+"\n"+episodeId;JSONObject prior=merged.get(key);JSONObject entry=prior==null?new JSONObject():new JSONObject(prior.toString());String now=Instant.now().toString();
            entry.put("comicId",comicId);entry.put("episodeId",episodeId);entry.put("pageIndex",Math.max(0,pageIndex));entry.put("updatedAt",now);entry.put("deviceId",deviceId);merged.put(key,entry);
            ArrayList<JSONObject> ordered=new ArrayList<>(merged.values());ordered.sort((a,b)->b.optString("updatedAt","").compareTo(a.optString("updatedAt","")));JSONArray out=new JSONArray();for(JSONObject value:ordered)out.put(value);
            JSONObject next=new JSONObject();next.put("schemaVersion",1);next.put("updatedAt",now);next.put("entries",out);putJson(READING_PATH,next);
        }catch(Exception e){throw new IllegalStateException(e.getMessage()==null?"云端阅读进度同步失败":e.getMessage(),e);}
    }

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

    private boolean testOnce() throws Exception {
        HttpURLConnection c=null;
        try{
            c=open("v1/control/current.json","application/json");c.setRequestMethod("GET");int s=c.getResponseCode();
            if(s==401||s==403)throw new IllegalStateException("WebDAV 认证失败 · HTTP "+s+" · 请检查用户名和 App Password");
            if(s==404)return true;
            if(s==408||s==425||s==429||(s>=500&&s<=599))throw new IOException("WebDAV 服务暂时不可用 · HTTP "+s);
            if(s>=200&&s<400)return true;
            throw new IOException("WebDAV 返回异常状态 · HTTP "+s);
        }finally{if(c!=null)c.disconnect();}
    }
    boolean test() throws Exception {
        Exception last=null;
        for(int attempt=0;attempt<2;attempt++){
            try{return testOnce();}
            catch(UnknownHostException e){throw new IllegalStateException("DNS 解析失败 · 手机无法找到 WebDAV 域名；通常不需要梯子，请先切换 Wi‑Fi/移动网络后重试",e);}
            catch(SocketTimeoutException e){last=e;if(attempt==0){try{Thread.sleep(600);}catch(InterruptedException interrupted){Thread.currentThread().interrupt();throw new IllegalStateException("连接已取消",interrupted);}continue;}throw new IllegalStateException("WebDAV 连接超时 · 当前手机网络到网盘线路不稳定；通常不需要梯子，可尝试切换 Wi‑Fi/移动网络",e);}
            catch(SSLException e){throw new IllegalStateException("TLS/证书连接失败 · 请检查系统时间、证书或当前网络/VPN",e);}
            catch(ConnectException e){last=e;if(attempt==0){try{Thread.sleep(600);}catch(InterruptedException interrupted){Thread.currentThread().interrupt();throw new IllegalStateException("连接已取消",interrupted);}continue;}throw new IllegalStateException("无法连接 WebDAV 服务器 · 请检查地址和当前网络",e);}
            catch(IllegalStateException e){throw e;}
            catch(IOException e){last=e;if(attempt==0){try{Thread.sleep(600);}catch(InterruptedException interrupted){Thread.currentThread().interrupt();throw new IllegalStateException("连接已取消",interrupted);}continue;}throw new IllegalStateException(e.getMessage()==null?"WebDAV 网络请求失败":e.getMessage(),e);}
        }
        throw last==null?new IllegalStateException("WebDAV 测试失败"):last;
    }
}
