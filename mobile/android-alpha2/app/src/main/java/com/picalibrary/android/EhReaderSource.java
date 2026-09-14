package com.picalibrary.android;

import android.content.Context;
import java.net.HttpURLConnection;
import java.util.*;

/** Public E-H online reader source. The stable page URL is resolved to a temporary image URL on every image request. */
final class EhReaderSource implements ReaderSource {
    private final Context context;
    private final EhClient client;
    private final Map<String,EhClient.Episode> episodes=new HashMap<>();
    private final Map<String,BridgeClient.ChapterItem> knownChapters=new HashMap<>();
    private String comicTitle="",author="";
    EhReaderSource(Context context){this.context=context.getApplicationContext();this.client=new EhClient(this.context);}
    public String kind(){return "eh";}
    public String scope(){return ReaderPolicy.hash("eh-public-v1");}
    public List<BridgeClient.ChapterItem> chapters(String comicId) throws Exception {EhClient.Comic comic=client.comic(comicId);comicTitle=comic.title;author=comic.author;List<EhClient.Episode> remote=client.episodes(comicId);List<BridgeClient.ChapterItem> out=new ArrayList<>();episodes.clear();knownChapters.clear();for(EhClient.Episode episode:remote){episodes.put(episode.id,episode);BridgeClient.ChapterItem item=new BridgeClient.ChapterItem(episode.id,episode.title,episode.order,comic.pagesCount);knownChapters.put(item.id,item);out.add(item);}UnifiedEhCatalogSync.merge(context,comic);return out;}
    public BridgeClient.ChapterData chapter(String comicId,String episodeId) throws Exception {EhClient.Episode episode=episodes.get(episodeId);if(episode==null){for(EhClient.Episode value:client.episodes(comicId)){episodes.put(value.id,value);if(value.id.equals(episodeId))episode=value;}}if(episode==null)throw new IllegalStateException("E-H 章节不存在");List<EhClient.Page> remote=client.pages(comicId);List<BridgeClient.PageItem> pages=new ArrayList<>();for(EhClient.Page page:remote)pages.add(new BridgeClient.PageItem(page.id,page.pageUrl,page.position));BridgeClient.ChapterItem item=new BridgeClient.ChapterItem(episode.id,episode.title,episode.order,pages.size());knownChapters.put(item.id,item);return new BridgeClient.ChapterData(item,pages,0);}
    public String recentChapter(String comicId){return "";}
    public HttpURLConnection image(String path) throws Exception {return client.image(path);}
    public void saveProgress(String comicId,String episodeId,int pageIndex){if(!RemoteConfigStore.load(context).configured())return;BridgeClient.ChapterItem chapter=knownChapters.get(episodeId);try{new RemoteLibraryClient(context).saveReadingProgress(DeviceIdentity.id(context),comicId,episodeId,pageIndex,comicTitle,author,chapter==null?"":chapter.title,chapter==null?0:chapter.order);}catch(Exception e){throw new IllegalStateException("E-H 阅读进度云端同步失败",e);}}
}
