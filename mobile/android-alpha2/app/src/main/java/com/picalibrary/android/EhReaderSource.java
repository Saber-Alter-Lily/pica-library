package com.picalibrary.android;

import android.content.Context;
import java.net.HttpURLConnection;
import java.util.*;

/** Public E-H online reader source with lazy per-page image resolution. */
final class EhReaderSource implements ReaderSource {
    private final Context context;
    private final EhClient client;
    private final EhReaderResolver resolver;
    private final Map<String,EhClient.Episode> episodes=new HashMap<>();
    private final Map<String,BridgeClient.ChapterItem> knownChapters=new HashMap<>();
    private String comicTitle="",author="";
    EhReaderSource(Context context){this.context=context.getApplicationContext();this.client=new EhClient(this.context);this.resolver=new EhReaderResolver(this.context);}
    public String kind(){return "eh";}
    public String scope(){return ReaderPolicy.hash("eh-public-v4-shared-session");}

    private static String episodeId(String comicId){String[] parts=comicId==null?new String[0]:comicId.split(":",3);return parts.length>=2?"eh-"+parts[1]:"eh-gallery";}
    private EhClient.Episode syntheticEpisode(String comicId,String title){return new EhClient.Episode(episodeId(comicId),title==null||title.isEmpty()?"E-H 画廊":title,1);}
    private BridgeClient.ChapterItem remember(EhClient.Episode episode,int pages){episodes.put(episode.id,episode);BridgeClient.ChapterItem item=new BridgeClient.ChapterItem(episode.id,episode.title,episode.order,Math.max(1,pages));knownChapters.put(item.id,item);return item;}

    public List<BridgeClient.ChapterItem> chapters(String comicId) throws Exception {
        episodes.clear();knownChapters.clear();UnifiedCatalogStore.Entry cached=UnifiedCatalogStore.load(context).byId.get(comicId);
        if(cached!=null&&cached.knownPictures>0){comicTitle=cached.title;author=cached.displayAuthor();EhClient.Episode episode=syntheticEpisode(comicId,cached.title);return Collections.singletonList(remember(episode,cached.knownPictures));}
        EhClient.Comic comic=client.comic(comicId);comicTitle=comic.title;author=comic.author;UnifiedEhCatalogSync.merge(context,comic);EhClient.Episode episode=syntheticEpisode(comicId,comic.title);return Collections.singletonList(remember(episode,comic.pagesCount));
    }

    public BridgeClient.ChapterData chapter(String comicId,String episodeId) throws Exception {
        EhClient.Episode episode=episodes.get(episodeId);if(episode==null){chapters(comicId);episode=episodes.get(episodeId);}if(episode==null)throw new IllegalStateException("E-H 章节不存在");
        BridgeClient.ChapterItem known=knownChapters.get(episodeId);int expected=known==null?0:Math.max(0,known.downloadedPictures);if(expected<=0)throw new IllegalStateException("E-H 画廊页数未知");
        List<BridgeClient.PageItem> pages=new ArrayList<>(expected);String[] parts=comicId.split(":",3);String gid=parts.length>=2?parts[1]:"gallery";
        for(int position=1;position<=expected;position++){String locator=EhReaderResolver.locator(comicId,position);pages.add(new BridgeClient.PageItem("eh-"+gid+"-"+position,locator,position));}
        BridgeClient.ChapterItem item=new BridgeClient.ChapterItem(episode.id,episode.title,episode.order,pages.size());knownChapters.put(item.id,item);return new BridgeClient.ChapterData(item,pages,0);
    }
    public String recentChapter(String comicId){return "";}
    public HttpURLConnection image(String path) throws Exception {return EhReaderResolver.handles(path)?resolver.openImage(path):client.image(path);}
    String diagnose(String path){return EhReaderResolver.handles(path)?resolver.diagnose(path):"E-H 诊断不可用于该页面";}
    public void saveProgress(String comicId,String episodeId,int pageIndex){if(!RemoteConfigStore.load(context).configured())return;BridgeClient.ChapterItem chapter=knownChapters.get(episodeId);try{new RemoteLibraryClient(context).saveReadingProgress(DeviceIdentity.id(context),comicId,episodeId,pageIndex,comicTitle,author,chapter==null?"":chapter.title,chapter==null?0:chapter.order);}catch(Exception e){throw new IllegalStateException("E-H 阅读进度云端同步失败",e);}}
}
