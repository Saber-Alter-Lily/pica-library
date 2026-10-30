package com.picalibrary.android;

import android.content.Context;
import java.util.List;

/** Source-neutral chapter, progress and Reader presentation contract. */
interface ReaderChapterSource extends ReaderImageTransport {
    default String displayTitle(String comicId){return "";}
    default boolean emitsRecommendationEvidence(){return true;}
    default String readerLabel(Context context,boolean compact){return compact?"电脑/缓存":"电脑连接";}
    default String chapterDiagnosticPath(String comicId){return "";}
    default boolean canDiagnosePage(){return false;}
    default String diagnose(String path){return "当前来源没有额外诊断信息";}
    String kind();
    List<? extends ReaderContent.Chapter> chapters(String comicId) throws Exception;
    ReaderContent.ChapterData chapter(String comicId,String episodeId) throws Exception;
    String recentChapter(String comicId) throws Exception;
    void saveProgress(String comicId,String episodeId,int pageIndex);
    default void rememberPosition(String comicId,String episodeId,int pageIndex) { }
    default int restorePosition(String comicId,String episodeId,int fallback){return fallback;}
}
