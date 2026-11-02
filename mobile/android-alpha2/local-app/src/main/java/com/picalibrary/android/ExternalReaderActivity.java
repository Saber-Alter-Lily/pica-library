package com.picalibrary.android;

import android.content.Context;
import android.os.Bundle;
import java.net.HttpURLConnection;
import java.time.LocalDate;
import java.util.List;

/**
 * The actual source-free ReaderScreenActivity, with one provider-neutral
 * ReaderChapterSource over a same-signer Binder companion. No network API
 * in this reader package; local import, shelves and bookmarks remain intact.
 */
public final class ExternalReaderActivity extends LocalReaderActivity {
    private BoundSourceClient client;
    private static final ReaderHistoryPort HISTORY=new ReaderHistoryPort(){
        @Override public Metadata resolve(Context context,ReaderChapterSource source,
                                          String comicId){
            return new Metadata(source.displayTitle(comicId),"","host");
        }
        @Override public LocalDate localDay(String stamp){
            return ReaderHistoryLedger.localDay(stamp);
        }
        @Override public void record(Context context,String id,String comic,String chapter,
                String title,String author,String chapterTitle,int order,
                String provider,String kind,int page,String start,String end){
            ReaderHistoryLedger.record(context,ReaderHistoryLedger.localFile(context),
                id,comic,chapter,title,author,chapterTitle,order,
                "host","host",page,start,end);
        }
    };

    @Override protected ReaderChapterSource createReaderSource(String kind){
        if("local".equals(kind))return super.createReaderSource(kind);
        if(!"host".equals(kind))throw new IllegalArgumentException("INVALID_SOURCE_HOST");
        String comic=getIntent().getStringExtra("comicId");
        String scope=getIntent().getStringExtra("scope");
        if(comic==null||!comic.matches("hosted:[0-9a-f-]{36}:[0-9a-f]{64}"))
            throw new IllegalArgumentException("INVALID_SOURCE_HOST");
        client=new BoundSourceClient(this,scope);
        return new SignedCompanionSource(client,scope,
            getIntent().getStringExtra("title"));
    }
    @Override protected ReaderProgressLedger createReaderProgress(ReaderChapterSource source){
        if("host".equals(source.kind()))
            return new ReaderProgressLedger(this,source,HISTORY);
        return super.createReaderProgress(source);
    }
    @Override protected void onDestroy(){
        super.onDestroy();
        if(client!=null)client.close();
    }

    private static final class SignedCompanionSource implements ReaderChapterSource{
        private final BoundSourceClient client;
        private final String scope,title;
        SignedCompanionSource(BoundSourceClient client,String scope,String title){
            this.client=client;
            this.scope="signed-user-host:"+scope;
            this.title=title==null?"":title;
        }
        @Override public String kind(){return "host";}
        @Override public String scope(){return scope;}
        @Override public String displayTitle(String comic){return title;}
        @Override public String readerLabel(Context context,boolean compact){
            return LocalCopy.ui(context,"外部来源","External source","外部ソース");
        }
        @Override public boolean emitsRecommendationEvidence(){return false;}
        @Override public List<ReaderContent.Chapter> chapters(String comic)throws Exception{
            return client.chapters(comic);
        }
        @Override public ReaderContent.ChapterData chapter(String comic,String episode)
                throws Exception{
            return client.chapter(comic,episode);
        }
        @Override public String recentChapter(String comic){return "";}
        @Override public void saveProgress(String comic,String episode,int page){}
        @Override public HttpURLConnection image(String locator)throws Exception{
            return client.image(locator);
        }
        @Override public void commitImageCache(CacheWrite write){
            try{
                client.check();
                write.run();
                client.check();
            }catch(Exception failure){
                throw new IllegalStateException("SOURCE_HOST_CANCELLED");
            }
        }
        @Override public boolean isAccessRevoked(Throwable failure){
            return failure!=null&&String.valueOf(failure.getMessage())
                .startsWith("SOURCE_HOST_");
        }
        @Override public String diagnose(String locator){return "";}
    }
}
