package com.picalibrary.android;

import android.content.Context;
import com.picalibrary.android.sources.SourceAccessPolicy;
import java.net.HttpURLConnection;
import java.util.List;

/** Direct user-host adapter to the existing ReaderActivity/ReaderImages/progress ledger. */
final class HostReaderSource implements ReaderSource {
    private final HostSourceManager manager;
    private final HostSourceManager.Session session;
    HostReaderSource(Context context){this(HostSourceManager.get(context));}
    HostReaderSource(HostSourceManager manager){this.manager=manager;try{session=manager.requireSession();}catch(RuntimeException unavailable){throw new IllegalArgumentException("SOURCE_HOST_CANCELLED");}}
    public String kind(){return "host";}
    public String readerLabel(Context context,boolean compact){return context.getString(R.string.host_title);}
    public String scope(){return session.scope;}
    public String displayTitle(String comic){try{return manager.title(session,comic);}catch(RuntimeException unavailable){return "";}}
    public boolean emitsRecommendationEvidence(){return false;} // Host-only IDs are not part of portable recommendation sync.
    public SourceAccessPolicy.Access sourceAccess(){return session;}
    public List<BridgeClient.ChapterItem> chapters(String comic)throws Exception{try{List<BridgeClient.ChapterItem> out=new java.util.ArrayList<>();for(ReaderContent.Chapter item:manager.chapters(session,comic))out.add(new BridgeClient.ChapterItem(item.id,item.title,item.order,item.downloadedPictures));return out;}catch(Exception failure){throw sanitized(failure);}}
    public BridgeClient.ChapterData chapter(String comic,String episode)throws Exception{try{ReaderContent.ChapterData data=manager.chapter(session,comic,episode);BridgeClient.ChapterItem chapter=new BridgeClient.ChapterItem(data.episode.id,data.episode.title,data.episode.order,data.episode.downloadedPictures);List<BridgeClient.PageItem> pages=new java.util.ArrayList<>();for(ReaderContent.Page page:data.pages)pages.add(new BridgeClient.PageItem(page.id,page.url,page.position));return new BridgeClient.ChapterData(chapter,pages,data.progressIndex);}catch(Exception failure){throw sanitized(failure);}}
    public HttpURLConnection image(String locator)throws Exception{try{return manager.image(session,locator);}catch(Exception failure){throw sanitized(failure);}}
    public String recentChapter(String comic){return "";}
    public void saveProgress(String comic,String episode,int page){} // Existing scoped local ledger only; no host sync mutation.
    private static java.io.IOException sanitized(Exception failure){String code=failure.getMessage();return new java.io.IOException(code!=null&&code.matches("(?:INVALID_SOURCE_HOST|SOURCE_HOST_[A-Z_]+)")?code:"SOURCE_HOST_UNAVAILABLE");}
}
