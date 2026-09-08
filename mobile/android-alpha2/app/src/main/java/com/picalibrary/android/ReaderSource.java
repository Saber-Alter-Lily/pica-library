package com.picalibrary.android;

import android.content.Context;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONObject;

interface ReaderSource {
    String kind();
    String scope();
    List<BridgeClient.ChapterItem> chapters(String comicId) throws Exception;
    BridgeClient.ChapterData chapter(String comicId,String episodeId) throws Exception;
    HttpURLConnection image(String path) throws Exception;
    void saveProgress(String comicId,String episodeId,int pageIndex);
}

final class DesktopReaderSource implements ReaderSource {
    private final Context context;
    DesktopReaderSource(Context context){this.context=context.getApplicationContext();}
    public String kind(){return "desktop";}
    public String scope(){return ReaderPolicy.hash(BridgeStore.host(context)+"\n"+BridgeStore.token(context));}
    public List<BridgeClient.ChapterItem> chapters(String comicId) throws Exception {return BridgeClient.chapters(context,comicId);}
    public BridgeClient.ChapterData chapter(String comicId,String episodeId) throws Exception {return BridgeClient.chapter(context,comicId,episodeId);}
    public HttpURLConnection image(String path) throws Exception {
        String host=BridgeStore.host(context);if(host.isEmpty())throw new IllegalStateException("尚未配对 Desktop");
        HttpURLConnection c=(HttpURLConnection)new URL(host.replaceAll("/$","")+path).openConnection();c.setConnectTimeout(2500);c.setReadTimeout(15000);c.setRequestProperty("Accept","image/*");c.setRequestProperty("Authorization","Bearer "+BridgeStore.token(context));c.setUseCaches(false);return c;
    }
    public void saveProgress(String comicId,String episodeId,int pageIndex){
        BridgeClient.saveProgress(context,comicId,episodeId,pageIndex);
    }
}

final class RemoteReaderSource implements ReaderSource {
    private final RemoteLibraryClient client;
    RemoteReaderSource(Context context){client=new RemoteLibraryClient(context);}
    public String kind(){return "remote";}
    public String scope(){return client.scope();}
    public List<BridgeClient.ChapterItem> chapters(String comicId) throws Exception {
        JSONObject root=client.comic("v1/comics/"+java.net.URLEncoder.encode(comicId,"UTF-8").replace("+","%20")+"/manifest.json");
        JSONArray arr=root.optJSONArray("episodes");List<BridgeClient.ChapterItem> out=new ArrayList<>();
        if(arr!=null)for(int i=0;i<arr.length();i++){JSONObject o=arr.optJSONObject(i);if(o==null)continue;out.add(new BridgeClient.ChapterItem(o.optString("episodeId"),o.optString("title","章节"),o.optInt("order",i+1),o.optInt("pageCount",0)));}return out;
    }
    public BridgeClient.ChapterData chapter(String comicId,String episodeId) throws Exception {
        JSONObject comic=client.comic("v1/comics/"+java.net.URLEncoder.encode(comicId,"UTF-8").replace("+","%20")+"/manifest.json");JSONArray episodes=comic.optJSONArray("episodes");JSONObject selected=null;
        if(episodes!=null)for(int i=0;i<episodes.length();i++){JSONObject o=episodes.optJSONObject(i);if(o!=null&&episodeId.equals(o.optString("episodeId"))){selected=o;break;}}
        if(selected==null)throw new IllegalStateException("云端章节不存在");JSONObject episode=client.episode(selected.optString("manifestPath"));JSONArray arr=episode.optJSONArray("pages");List<BridgeClient.PageItem> pages=new ArrayList<>();
        if(arr!=null)for(int i=0;i<arr.length();i++){JSONObject o=arr.optJSONObject(i);if(o==null)continue;String objectPath=o.optString("objectPath");pages.add(new BridgeClient.PageItem(objectPath,objectPath,o.optInt("index",i)+1));}
        BridgeClient.ChapterItem item=new BridgeClient.ChapterItem(episodeId,episode.optString("title",selected.optString("title","章节")),episode.optInt("order",selected.optInt("order",0)),pages.size());return new BridgeClient.ChapterData(item,pages,0);
    }
    public HttpURLConnection image(String path) throws Exception {if(path==null||!path.startsWith("v1/")||path.contains("..")||path.contains("\\"))throw new IllegalArgumentException("无效的云端图片路径");return client.open(path,"image/*");}
    public void saveProgress(String comicId,String episodeId,int pageIndex){/* Local source-scoped bookmark is authoritative until cloud state sync lands. */}
}
