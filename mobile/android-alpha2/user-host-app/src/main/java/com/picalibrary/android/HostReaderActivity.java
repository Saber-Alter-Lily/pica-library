package com.picalibrary.android;

import android.content.Context;
import java.net.HttpURLConnection;
import java.time.LocalDate;
import java.util.List;
import com.picalibrary.android.sources.SourceAccessPolicy;

/**
 * Same existing ReaderScreenActivity and original local-copy Reader renderer.
 * The only Host-specific element is the source-neutral ReaderChapterSource port.
 */
public final class HostReaderActivity extends LocalReaderActivity {
    private static final ReaderHistoryPort HOST_HISTORY=new ReaderHistoryPort(){
        public Metadata resolve(Context context,ReaderChapterSource source,String comicId){
            return new Metadata(source.displayTitle(comicId),"","host");
        }
        public LocalDate localDay(String stamp){
            return ReaderHistoryLedger.localDay(stamp);
        }
        public void record(Context context,String session,String comic,String chapter,
                String title,String author,String chapterTitle,int order,
                String provider,String source,int page,String start,String read){
            ReaderHistoryLedger.record(context,ReaderHistoryLedger.localFile(context),
                    session,comic,chapter,title,author,chapterTitle,order,
                    "host","host",page,start,read);
        }
    };
    @Override protected ReaderChapterSource createReaderSource(String kind){
        return "host".equals(kind)?new UserHostChapterSource(this):
                super.createReaderSource(kind);
    }
    @Override protected ReaderProgressLedger createReaderProgress(ReaderChapterSource source){
        return "host".equals(source.kind())?
                new ReaderProgressLedger(this,source,HOST_HISTORY):
                super.createReaderProgress(source);
    }
    private static final class UserHostChapterSource implements ReaderChapterSource {
        private final HostSourceManager manager;
        private final HostSourceManager.Session session;
        UserHostChapterSource(Context context){
            manager=HostSourceManager.get(context);
            session=manager.requireSession();
        }
        public String kind(){return "host";}
        public String scope(){return session.scope;}
        public String displayTitle(String comic){return manager.title(session,comic);}
        public String readerLabel(Context context,boolean compact){
            return LocalCopy.ui(context,"我的外部 Host","My external Host","自分の外部 Host");
        }
        public boolean emitsRecommendationEvidence(){return false;}
        public List<ReaderContent.Chapter> chapters(String comic)throws Exception{
            return manager.chapters(session,comic);
        }
        public ReaderContent.ChapterData chapter(String comic,String episode)throws Exception{
            return manager.chapter(session,comic,episode);
        }
        public String recentChapter(String comic){return "";}
        public void saveProgress(String comic,String episode,int page){}
        public HttpURLConnection image(String locator)throws Exception{
            return manager.image(session,locator);
        }
        public void commitImageCache(CacheWrite write){
            try{session.commit(()->{write.run();return null;});}
            catch(Exception e){throw new IllegalStateException("SOURCE_HOST_CANCELLED",e);}
        }
        public boolean isAccessRevoked(Throwable problem){
            return problem instanceof SourceAccessPolicy.Disabled ||
                    problem instanceof IllegalStateException &&
                    String.valueOf(problem.getMessage()).startsWith("SOURCE_HOST_");
        }
        public String diagnose(String path){return "";}
    }
}
