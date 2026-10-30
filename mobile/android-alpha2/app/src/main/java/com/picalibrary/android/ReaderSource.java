package com.picalibrary.android;

import java.net.HttpURLConnection;
import java.util.List;

/** Neutral Reader contract; concrete Desktop/remote/provider implementations live separately. */
interface ReaderSource {
    default com.picalibrary.android.sources.SourceAccessPolicy.Access sourceAccess(){return null;}
    default String displayTitle(String comicId){return "";}
    default boolean emitsRecommendationEvidence(){return true;}
    String kind();
    String scope();
    List<BridgeClient.ChapterItem> chapters(String comicId) throws Exception;
    BridgeClient.ChapterData chapter(String comicId,String episodeId) throws Exception;
    String recentChapter(String comicId) throws Exception;
    HttpURLConnection image(String path) throws Exception;
    void saveProgress(String comicId,String episodeId,int pageIndex);
    default void rememberPosition(String comicId,String episodeId,int pageIndex) { }
    default int restorePosition(String comicId,String episodeId,int fallback) { return fallback; }
}
