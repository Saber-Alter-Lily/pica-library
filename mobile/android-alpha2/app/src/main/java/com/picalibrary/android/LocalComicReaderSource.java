package com.picalibrary.android;

import android.content.Context;
import android.net.Uri;
import java.net.HttpURLConnection;
import java.util.*;

/** Direct phone imports never instantiate a provider client or transmit local filesystem locators. */
final class LocalComicReaderSource implements ReaderSource {
    private final Context context;
    private final Map<String,List<BridgeClient.PageItem>> loadedPages=new HashMap<>();
    LocalComicReaderSource(Context context){this.context=context.getApplicationContext();}
    public String kind(){return "local";}
    public String scope(){return "android-local-import-v1";}
    public List<BridgeClient.ChapterItem> chapters(String id) throws Exception {
        LocalComicStore.Comic comic=required(id);LinkedHashMap<String,List<LocalComicStore.Page>> chapters=new LinkedHashMap<>();
        for(LocalComicStore.Page page:comic.pages)chapters.computeIfAbsent(page.chapterId,k->new ArrayList<>()).add(page);
        List<BridgeClient.ChapterItem> out=new ArrayList<>();int order=0;for(Map.Entry<String,List<LocalComicStore.Page>> chapter:chapters.entrySet())out.add(new BridgeClient.ChapterItem(chapter.getKey(),chapter.getValue().get(0).chapterTitle,++order,chapter.getValue().size()));return out;
    }
    public BridgeClient.ChapterData chapter(String id,String chapterId) throws Exception {
        LocalComicStore.Comic comic=required(id);List<BridgeClient.PageItem> pages=new ArrayList<>();String title="";int order=0;LinkedHashSet<String> chapters=new LinkedHashSet<>();
        for(LocalComicStore.Page page:comic.pages){chapters.add(page.chapterId);if(page.chapterId.equals(chapterId)){title=page.chapterTitle;order=chapters.size();pages.add(new BridgeClient.PageItem(page.id,Uri.fromFile(LocalComicStore.pageFile(context,comic,page)).toString(),pages.size()+1));}}
        if(pages.isEmpty())throw new IllegalStateException("Imported chapter is unavailable; reimport the original comic");loadedPages.put(id+"\n"+chapterId,pages);return new BridgeClient.ChapterData(new BridgeClient.ChapterItem(chapterId,title,order,pages.size()),pages,0);
    }
    private LocalComicStore.Comic required(String id) throws Exception {LocalComicStore.Comic comic=LocalComicStore.read(context,id);if(comic==null)throw new IllegalStateException("No imported copy on this phone");return comic;}
    public String recentChapter(String comic){return "";}
    public HttpURLConnection image(String path){throw new IllegalStateException("Imported pages use owned local files, not HTTP");}
    public void saveProgress(String comic,String chapter,int page){} // Existing local ledger is authoritative; no remote pointer.
    private List<BridgeClient.PageItem> loaded(String comic,String chapter) throws Exception {List<BridgeClient.PageItem> pages=loadedPages.get(comic+"\n"+chapter);return pages==null?chapter(comic,chapter).pages:pages;}
    public void rememberPosition(String comic,String chapter,int page){
        try{List<BridgeClient.PageItem> pages=loaded(comic,chapter);if(pages.isEmpty())return;String id=pages.get(Math.min(pages.size()-1,Math.max(0,page))).id;context.getSharedPreferences("local-import-page-bookmarks-v1",0).edit().putString(ReaderPolicy.hash(comic+"\n"+chapter),id).commit();}catch(Exception ignored){}
    }
    public int restorePosition(String comic,String chapter,int fallback){
        try{List<BridgeClient.PageItem> pages=loaded(comic,chapter);String id=context.getSharedPreferences("local-import-page-bookmarks-v1",0).getString(ReaderPolicy.hash(comic+"\n"+chapter),"");for(int i=0;i<pages.size();i++)if(pages.get(i).id.equals(id))return i;return Math.max(0,Math.min(pages.size()-1,fallback));}catch(Exception e){return Math.max(0,fallback);}
    }
}
