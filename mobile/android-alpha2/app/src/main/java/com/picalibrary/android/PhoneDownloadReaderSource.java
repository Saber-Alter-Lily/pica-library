package com.picalibrary.android;

import android.content.Context;
import java.net.HttpURLConnection;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/** Reads only fully readable explicit phone downloads through the shared ReaderActivity. */
final class PhoneDownloadReaderSource implements ReaderSource {
    private final Context context;
    PhoneDownloadReaderSource(Context context){this.context=context.getApplicationContext();}
    public String kind(){return "phone";}
    public String scope(){return "phone-download";}
    public List<BridgeClient.ChapterItem> chapters(String comicId){PhoneDownloadStore.Comic comic=PhoneDownloadStore.comic(context,comicId);List<BridgeClient.ChapterItem> out=new ArrayList<>();if(comic!=null)for(PhoneDownloadStore.Chapter chapter:comic.chapters)if(PhoneDownloadStore.chapterReadable(context,chapter))out.add(new BridgeClient.ChapterItem(chapter.id,chapter.title,chapter.order,chapter.pages.size()));out.sort(Comparator.comparingInt(c->c.order));return out;}
    public BridgeClient.ChapterData chapter(String comicId,String episodeId){PhoneDownloadStore.Comic comic=PhoneDownloadStore.comic(context,comicId);if(comic==null)throw new IllegalStateException("手机未下载这本漫画");for(PhoneDownloadStore.Chapter chapter:comic.chapters)if(chapter.id.equals(episodeId)){if(!PhoneDownloadStore.chapterReadable(context,chapter))throw new IllegalStateException("手机下载章节文件不完整，请重新下载本章");List<BridgeClient.PageItem> pages=new ArrayList<>();for(PhoneDownloadStore.Page page:chapter.pages)pages.add(new BridgeClient.PageItem("phone:"+comicId+":"+episodeId+":"+page.position,page.uri,page.position+1));return new BridgeClient.ChapterData(new BridgeClient.ChapterItem(chapter.id,chapter.title,chapter.order,pages.size()),pages,0);}throw new IllegalStateException("手机下载章节不存在");}
    public String recentChapter(String comicId){return "";}
    public HttpURLConnection image(String path){throw new IllegalStateException("手机下载页面由本地 URI 直接读取");}
    public void saveProgress(String comicId,String episodeId,int pageIndex){if(!RemoteConfigStore.load(context).configured())return;try{PhoneDownloadStore.Comic comic=PhoneDownloadStore.comic(context,comicId);String title=comic==null?"":comic.title,author=comic==null?"":comic.author,episodeTitle="";int order=0;if(comic!=null)for(PhoneDownloadStore.Chapter chapter:comic.chapters)if(chapter.id.equals(episodeId)){episodeTitle=chapter.title;order=chapter.order;break;}new RemoteLibraryClient(context).saveReadingProgress(DeviceIdentity.id(context),comicId,episodeId,pageIndex,title,author,episodeTitle,order);}catch(Exception ignored){}}
}