package com.picalibrary.android;

import android.app.AlertDialog;
import android.content.Context;
import android.graphics.Typeface;
import android.os.Bundle;
import android.widget.TextView;
import java.io.File;
import java.net.HttpURLConnection;
import java.time.LocalDate;
import java.util.List;

/**
 * Real original Reader UI with original local-import chapter/page and bookmark ports.
 * No provider classes, network, BridgeClient, replacement image renderer or database.
 */
public final class LocalReaderActivity extends ReaderScreenActivity {
    private static final ReaderHistoryPort HISTORY=new ReaderHistoryPort() {
        public Metadata resolve(Context context,ReaderChapterSource source,String comicId){
            return new Metadata(source.displayTitle(comicId),"", "local");
        }
        public LocalDate localDay(String timestamp){
            return ReaderHistoryLedger.localDay(timestamp);
        }
        public void record(Context context,String sessionId,String comicId,String chapterId,
                           String title,String author,String chapterTitle,int chapterOrder,
                           String providerId,String sourceKind,int page,String startedAt,String lastReadAt){
            // Same original schema, session grouping and file format as the installed app.
            // This independent QA application writes only its private files directory.
            ReaderHistoryLedger.record(context,ReaderHistoryLedger.localFile(context),
                    sessionId,comicId,chapterId,title,author,chapterTitle,chapterOrder,
                    providerId,sourceKind,page,startedAt,lastReadAt);
        }
    };

    private static final ReaderPageStorage STORAGE=new ReaderPageStorage(){
        public File cacheDir(Context context,String name){
            File folder=new File(context.getCacheDir(),name);
            if(!folder.isDirectory())folder.mkdirs();
            return folder;
        }
        public File cacheRoot(Context context){return context.getCacheDir();}
        public long pageLimitBytes(Context context){return 256L*1024*1024;}
        public String failurePrefix(Context context){return "图片读取失败 · ";}
        public String disabledMessage(Context context){return "Local file unavailable";}
    };

    private static final class ImportedChapterSource implements ReaderChapterSource {
        private final LocalComicReaderPort local;
        ImportedChapterSource(Context context){local=new LocalComicReaderPort(context);}
        public String kind(){return "local";}
        public String scope(){return LocalComicReaderPort.SCOPE;}
        public String displayTitle(String comicId){return local.displayTitle(comicId);}
        public boolean emitsRecommendationEvidence(){return false;}
        public String readerLabel(Context context,boolean compact){return LocalCopy.ui(context,"本地","Local","ローカル");}
        public List<LocalComicReaderPort.Chapter> chapters(String id)throws Exception{return local.chapters(id);}
        public LocalComicReaderPort.ChapterData chapter(String id,String chapter)throws Exception{return local.chapter(id,chapter);}
        public String recentChapter(String comicId){return "";}
        public void saveProgress(String comicId,String chapterId,int pageIndex){
            // The original local ReaderProgress ledger is the storage authority.
        }
        public void rememberPosition(String comicId,String chapterId,int pageIndex){
            local.rememberPosition(comicId,chapterId,pageIndex);
        }
        public int restorePosition(String comicId,String chapterId,int fallback){
            return local.restorePosition(comicId,chapterId,fallback);
        }
        public HttpURLConnection image(String path){
            throw new IllegalStateException("Imported page reading never opens a network connection");
        }
        public void commitImageCache(CacheWrite write){
            throw new IllegalStateException("Imported pages are read from owned local files");
        }
        public boolean isAccessRevoked(Throwable error){return false;}
        public String diagnose(String path){return "";}
    }

    @Override protected ReaderChapterSource createReaderSource(String kind){
        if(!"local".equals(kind))throw new IllegalArgumentException("Only imported local comics are available");
        return new ImportedChapterSource(this);
    }
    @Override protected ReaderImageLoader createReaderImages(ReaderChapterSource source){
        return new ReaderImageLoader(this,source,STORAGE);
    }
    @Override protected ReaderProgressLedger createReaderProgress(ReaderChapterSource source){
        return new ReaderProgressLedger(this,source,HISTORY);
    }
    @Override protected ReaderDisplaySettings.Snapshot reconcileReaderSettings(){
        return ReaderDisplaySettings.local(this);
    }
    @Override protected void pushReaderSettings(){}
    @Override protected int readerPrefetchPages(){
        return getSharedPreferences("local-reader-qa-options",MODE_PRIVATE).getInt("prefetch",2);
    }
    @Override protected String translateReaderText(String original){
        // Keep original Reader copy for this source-free engineering build;
        // full product localization remains under G1.
        return original;
    }
    @Override protected TextView readerText(String value,float sp,int color,boolean bold){
        TextView view=new TextView(this);
        view.setText(value);
        view.setTextSize(sp);
        view.setTextColor(color);
        view.setTypeface(Typeface.DEFAULT,bold?Typeface.BOLD:Typeface.NORMAL);
        view.setLineSpacing(0,1.08f);
        return view;
    }
    @Override protected String readerGestureTitle(){
        return ReaderGesturePanel.title(this,LocalCopy::ui);
    }
    @Override protected void showReaderGestures(Runnable changed,Runnable dismissed){
        ReaderGesturePanel.show(this,LocalCopy::ui,changed,dismissed);
    }
    @Override protected void openReaderStorageSettings(){
        final int[] values={0,2,4};
        final int chosen=readerPrefetchPages();
        String[] items={LocalCopy.ui(this,"关闭预载","No prefetch","先読みなし"),
                        "2", "4"};
        new AlertDialog.Builder(this)
            .setTitle(LocalCopy.ui(this,"预载页数","Prefetch pages","先読みページ数"))
            .setSingleChoiceItems(items,chosen==0?0:chosen==4?2:1,(d,which)->{
                getSharedPreferences("local-reader-qa-options",MODE_PRIVATE)
                    .edit().putInt("prefetch",values[which]).apply();
                d.dismiss();
            }).setNegativeButton(android.R.string.cancel,null).show();
    }
    @Override protected void recordReaderComplete(Context context,String comicId){
        // No recommendation engine or provider-specific evidence in this binary.
    }
}
