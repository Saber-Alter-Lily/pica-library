package com.picalibrary.android;

import android.content.Context;
import java.time.LocalDate;

/** Original ReaderProgress API; the bookmark/session implementation is in :reader-view. */
final class ReaderProgress extends ReaderProgressLedger {
    private static final ReaderHistoryPort HISTORY=new ReaderHistoryPort() {
        public Metadata resolve(Context context,ReaderChapterSource source,String comicId){
            String id=comicId==null?"":comicId;
            String title="漫画",author="未知作者";
            String provider=EhClient.isEhId(id)?"eh":(id.startsWith("jm:")?"jm":
                    ("pica".equals(source.kind())?"pica":("host".equals(source.kind())?"host":"")));
            String supplied=source.displayTitle(id);
            if(supplied!=null&&!supplied.trim().isEmpty())title=supplied;
            UnifiedCatalogStore.Entry entry=UnifiedCatalogStore.load(context).byId.get(id);
            if(entry!=null){title=entry.title;author=entry.displayAuthor();provider=entry.providerId;}
            return new Metadata(title,author,provider);
        }
        public LocalDate localDay(String timestamp){
            return ReadingHistoryStore.localDay(timestamp);
        }
        public void record(Context context,String sessionId,String comicId,String chapterId,
                           String title,String author,String chapterTitle,int chapterOrder,
                           String providerId,String sourceKind,int page,String startedAt,String lastReadAt){
            ReadingHistoryStore.record(context,sessionId,comicId,chapterId,title,author,
                    chapterTitle,chapterOrder,providerId,sourceKind,page,startedAt,lastReadAt);
        }
    };

    ReaderProgress(Context context,ReaderChapterSource source){
        super(context,source,HISTORY);
    }
}
