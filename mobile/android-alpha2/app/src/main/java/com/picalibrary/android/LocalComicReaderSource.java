package com.picalibrary.android;

import android.content.Context;
import java.net.HttpURLConnection;
import java.util.ArrayList;
import java.util.List;

/**
 * Compatibility adapter for the original Reader UI. Local inventory, page
 * ownership and bookmarks live in the provider-free :local-storage module.
 */
final class LocalComicReaderSource implements ReaderSource {
    private final LocalComicReaderPort local;

    LocalComicReaderSource(Context context) {
        local=new LocalComicReaderPort(context);
    }

    public String kind() { return "local"; }
    public String scope() { return LocalComicReaderPort.SCOPE; }
    public String displayTitle(String id) { return local.displayTitle(id); }

    public List<BridgeClient.ChapterItem> chapters(String id) throws Exception {
        List<BridgeClient.ChapterItem> result=new ArrayList<>();
        for(LocalComicReaderPort.Chapter chapter:local.chapters(id))
            result.add(new BridgeClient.ChapterItem(chapter.id,chapter.title,
                    chapter.order,chapter.pageCount));
        return result;
    }

    public BridgeClient.ChapterData chapter(String id,String chapterId) throws Exception {
        LocalComicReaderPort.ChapterData data=local.chapter(id,chapterId);
        List<BridgeClient.PageItem> pages=new ArrayList<>();
        for(LocalComicReaderPort.Page page:data.pages)
            pages.add(new BridgeClient.PageItem(page.id,page.uri,page.position));
        LocalComicReaderPort.Chapter chapter=data.chapter;
        return new BridgeClient.ChapterData(
                new BridgeClient.ChapterItem(chapter.id,chapter.title,
                        chapter.order,chapter.pageCount),pages,0);
    }

    public String recentChapter(String comicId) { return ""; }
    public HttpURLConnection image(String path) {
        throw new IllegalStateException("Imported pages use owned local files, not HTTP");
    }
    public void saveProgress(String comicId,String chapterId,int pageIndex) {
        // Existing local ReaderProgress ledger is authoritative.
    }
    public void rememberPosition(String comicId,String chapterId,int pageIndex) {
        local.rememberPosition(comicId,chapterId,pageIndex);
    }
    public int restorePosition(String comicId,String chapterId,int fallback) {
        return local.restorePosition(comicId,chapterId,fallback);
    }
}
