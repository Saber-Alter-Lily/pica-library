package com.picalibrary.android;

import android.content.Context;
import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.*;
import org.json.*;

final class JmReaderSource implements ReaderSource {
    private final Context context;private final JmClientManager client;
    private final Map<String,BridgeClient.ChapterItem> knownChapters=new HashMap<>();
    JmReaderSource(Context context){this.context=context.getApplicationContext();client=JmClientManager.get(this.context);}
    public String kind(){return "jm";}
    public String scope(){return ReaderPolicy.hash("jm\n"+JmAccountStore.scope(context));}
    public List<BridgeClient.ChapterItem> chapters(String comicId) throws Exception {
        JSONArray rows=client.episodes(comicId);List<BridgeClient.ChapterItem> out=new ArrayList<>();
        for(int i=0;i<rows.length();i++){JSONObject row=rows.getJSONObject(i);BridgeClient.ChapterItem item=new BridgeClient.ChapterItem(row.getString("id"),row.optString("title","章节"),row.optInt("order",i+1),1);out.add(item);knownChapters.put(item.id,item);}return out;
    }
    public BridgeClient.ChapterData chapter(String comicId,String episodeId) throws Exception {
        BridgeClient.ChapterItem known=knownChapters.get(episodeId);if(known==null){chapters(comicId);known=knownChapters.get(episodeId);}if(known==null)throw new IllegalArgumentException("此漫画中不存在该章节");
        JSONArray rows=client.pages(episodeId);List<BridgeClient.PageItem> out=new ArrayList<>();for(int i=0;i<rows.length();i++){JSONObject row=rows.getJSONObject(i);out.add(new BridgeClient.PageItem(row.getString("id"),row.getString("url"),i+1));}
        return new BridgeClient.ChapterData(new BridgeClient.ChapterItem(episodeId,known.title,known.order,out.size()),out,0);
    }
    public String recentChapter(String comicId){return "";}
    public HttpURLConnection image(String locator) throws Exception {
        final byte[] bytes=client.image(locator);
        return new HttpURLConnection(new URL("https://jm-source.invalid/reader")){
            public void disconnect(){}public boolean usingProxy(){return false;}public void connect(){}
            public InputStream getInputStream(){return new ByteArrayInputStream(bytes);}
            public int getResponseCode(){return 200;}public String getContentType(){return org.picalibrary.sources.JmSource.imageContentType(bytes);}public int getContentLength(){return bytes.length;}
        };
    }
    public void saveProgress(String comicId,String episodeId,int pageIndex){}
}
