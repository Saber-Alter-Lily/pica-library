package com.picalibrary.android;

import android.content.Context;
import java.time.LocalDate;

/**
 * The original app provides catalog titles and the existing history ledger.
 * Reader bookmarks/session logic itself does not depend on either provider SDK.
 */
interface ReaderHistoryPort {
    final class Metadata {
        final String title,author,providerId;
        Metadata(String title,String author,String providerId){
            this.title=title;this.author=author;this.providerId=providerId;
        }
    }
    Metadata resolve(Context context,ReaderChapterSource source,String comicId);
    LocalDate localDay(String timestamp);
    void record(Context context,String sessionId,String comicId,String chapterId,
                String title,String author,String chapterTitle,int chapterOrder,
                String providerId,String sourceKind,int page,String startedAt,String lastReadAt);
}
