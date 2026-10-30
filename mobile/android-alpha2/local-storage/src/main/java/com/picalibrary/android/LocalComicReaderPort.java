package com.picalibrary.android;

import android.content.Context;
import android.net.Uri;
import java.io.File;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;

/**
 * Original Android-owned local comic inventory exposed without Desktop,
 * provider, HTTP or BridgeClient models. The existing Reader adapts this
 * port; no second page renderer or local storage implementation is created.
 */
public final class LocalComicReaderPort {
    public static final String SCOPE = "android-local-import-v1";

    public static final class Book {
        public final String id, title, updatedAt;
        public final int pageCount;
        Book(String id, String title, String updatedAt, int pageCount) {
            this.id=id; this.title=title; this.updatedAt=updatedAt; this.pageCount=pageCount;
        }
    }
    // Retain the original LocalComicReaderPort field names while sharing the
    // same source-neutral ReaderContent representation with all sources.
    public static final class Chapter extends ReaderContent.Chapter {
        public final int pageCount;
        Chapter(String id, String title, int order, int pageCount) {
            super(id,title,order,pageCount);
            this.pageCount=pageCount;
        }
    }
    public static final class Page extends ReaderContent.Page {
        public final String uri;
        Page(String id, String uri, int position) {
            super(id,uri,position);
            this.uri=uri;
        }
    }
    public static final class ChapterData extends ReaderContent.ChapterData {
        public final Chapter chapter;
        public final List<Page> pages;
        ChapterData(Chapter chapter, List<Page> pages) {
            super(chapter,pages,0);
            this.chapter=chapter; this.pages=pages;
        }
    }

    private final Context context;
    private final Map<String,List<Page>> loadedPages=new HashMap<>();

    public LocalComicReaderPort(Context context) {
        this.context=context.getApplicationContext();
    }

    public List<Book> books() {
        List<Book> results=new ArrayList<>();
        for(LocalComicStore.Comic comic:LocalComicStore.list(context))
            results.add(new Book(comic.id,comic.title,comic.updatedAt,comic.pages.size()));
        return results;
    }

    public File coverFile(String comicId) {
        return LocalComicStore.cover(context,comicId);
    }

    public String displayTitle(String comicId) {
        try { return required(comicId).title; }
        catch(Exception unavailable) { return ""; }
    }

    public List<Chapter> chapters(String comicId) throws Exception {
        LocalComicStore.Comic comic=required(comicId);
        LinkedHashMap<String,List<LocalComicStore.Page>> groups=new LinkedHashMap<>();
        for(LocalComicStore.Page page:comic.pages)
            groups.computeIfAbsent(page.chapterId,key->new ArrayList<>()).add(page);
        List<Chapter> chapters=new ArrayList<>();
        int order=0;
        for(Map.Entry<String,List<LocalComicStore.Page>> entry:groups.entrySet())
            chapters.add(new Chapter(entry.getKey(),entry.getValue().get(0).chapterTitle,
                    ++order,entry.getValue().size()));
        return chapters;
    }

    public ChapterData chapter(String comicId,String chapterId) throws Exception {
        LocalComicStore.Comic comic=required(comicId);
        List<Page> pages=new ArrayList<>();
        String title="";
        int order=0;
        LinkedHashSet<String> chapters=new LinkedHashSet<>();
        for(LocalComicStore.Page page:comic.pages) {
            chapters.add(page.chapterId);
            if(!page.chapterId.equals(chapterId))continue;
            title=page.chapterTitle;
            order=chapters.size();
            pages.add(new Page(page.id,
                    Uri.fromFile(LocalComicStore.pageFile(context,comic,page)).toString(),
                    pages.size()+1));
        }
        if(pages.isEmpty())
            throw new IllegalStateException("Imported chapter is unavailable; reimport the original comic");
        loadedPages.put(comicId+"\n"+chapterId,pages);
        return new ChapterData(new Chapter(chapterId,title,order,pages.size()),pages);
    }

    public void rememberPosition(String comicId,String chapterId,int pageIndex) {
        try {
            List<Page> pages=loaded(comicId,chapterId);
            if(pages.isEmpty())return;
            String pageId=pages.get(Math.min(pages.size()-1,Math.max(0,pageIndex))).id;
            context.getSharedPreferences("local-import-page-bookmarks-v1",0).edit()
                    .putString(ReaderPolicy.hash(comicId+"\n"+chapterId),pageId).commit();
        } catch(Exception ignored) { }
    }

    public int restorePosition(String comicId,String chapterId,int fallback) {
        try {
            List<Page> pages=loaded(comicId,chapterId);
            String pageId=context.getSharedPreferences("local-import-page-bookmarks-v1",0)
                    .getString(ReaderPolicy.hash(comicId+"\n"+chapterId),"");
            for(int i=0;i<pages.size();i++)if(pages.get(i).id.equals(pageId))return i;
            return Math.max(0,Math.min(pages.size()-1,fallback));
        } catch(Exception unavailable) {
            return Math.max(0,fallback);
        }
    }

    private List<Page> loaded(String comicId,String chapterId) throws Exception {
        List<Page> pages=loadedPages.get(comicId+"\n"+chapterId);
        return pages==null?chapter(comicId,chapterId).pages:pages;
    }

    private LocalComicStore.Comic required(String id) throws Exception {
        LocalComicStore.Comic comic=LocalComicStore.read(context,id);
        if(comic==null)throw new IllegalStateException("No imported copy on this phone");
        return comic;
    }
}
