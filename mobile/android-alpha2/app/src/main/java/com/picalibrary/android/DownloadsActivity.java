package com.picalibrary.android;

import android.app.*;
import android.content.Intent;
import android.os.Bundle;
import android.view.Gravity;
import android.widget.*;
import java.util.Locale;
import java.util.concurrent.*;

/** Completed persistent phone downloads. Active/failed jobs live in TaskCenterActivity. */
public final class DownloadsActivity extends LocaleAwareActivity {
    private static final class DownloadState {
        final PhoneDownloadStore.Snapshot snapshot;
        final long bytes;
        DownloadState(PhoneDownloadStore.Snapshot snapshot,long bytes){this.snapshot=snapshot;this.bytes=bytes;}
    }

    private final ExecutorService worker=Executors.newSingleThreadExecutor();
    private LinearLayout content;
    private boolean destroyed;
    private int loadGeneration;

    @Override public void onCreate(Bundle saved){super.onCreate(saved);Ui.applyWindow(this);render();}
    @Override protected void onResume(){super.onResume();loadDownloads();}
    private Button button(String label,android.view.View.OnClickListener action){return Ui.button(this,label,action,false);}

    private void render(){
        LinearLayout root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);root.setBackgroundColor(Ui.BG);root.setOnApplyWindowInsetsListener((v,i)->{v.setPadding(0,i.getSystemWindowInsetTop(),0,i.getSystemWindowInsetBottom());return i;});
        LinearLayout bar=new LinearLayout(this);bar.setGravity(Gravity.CENTER_VERTICAL);bar.addView(Ui.button(this,"‹ 返回",v->finish(),true));bar.addView(Ui.text(this,"手机下载",22,Ui.TEXT,true),new LinearLayout.LayoutParams(0,-2,1));bar.addView(Ui.button(this,"任务",v->startActivity(new Intent(this,TaskCenterActivity.class)),true));root.addView(bar);
        ScrollView scroll=new ScrollView(this);scroll.setBackgroundColor(Ui.BG);content=new LinearLayout(this);content.setOrientation(LinearLayout.VERTICAL);content.setPadding(Ui.dp(this,12),Ui.dp(this,6),Ui.dp(this,12),Ui.dp(this,24));scroll.addView(content);root.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));setContentView(root);root.requestApplyInsets();renderLoading();
    }

    private void renderLoading(){
        if(content==null)return;
        content.removeAllViews();
        ProgressBar progress=new ProgressBar(this);content.addView(progress);
        TextView text=Ui.text(this,LocalizedText.ui("正在读取手机下载…"),13,Ui.MUTED,false);text.setPadding(0,Ui.dp(this,8),0,0);content.addView(text);
    }

    private DownloadState readDownloads(){
        PhoneDownloadStore.Snapshot snapshot=PhoneDownloadStore.load(this);
        return new DownloadState(snapshot,PhoneDownloadStore.estimatedBytes(this,snapshot));
    }

    private void loadDownloads(){
        final int generation=++loadGeneration;
        renderLoading();
        worker.submit(()->{
            DownloadState state=readDownloads();
            runOnUiThread(()->{
                if(destroyed||generation!=loadGeneration)return;
                renderList(state);
            });
        });
    }

    private void renderList(DownloadState state){
        if(content==null)return;
        PhoneDownloadStore.Snapshot snapshot=state.snapshot;
        content.removeAllViews();
        content.addView(Ui.text(this,"主动下载是持久正文，不受阅读/封面缓存上限或 LRU 清理影响。当前约 "+format(state.bytes)+"。",12,Ui.MUTED,false));
        LinearLayout actions=new LinearLayout(this);actions.setPadding(0,Ui.dp(this,8),0,Ui.dp(this,8));actions.addView(button("后台任务",v->startActivity(new Intent(this,TaskCenterActivity.class))),new LinearLayout.LayoutParams(0,-2,1));Ui.gap(actions,this,8);actions.addView(button("存储设置",v->startActivity(new Intent(this,StorageSettingsActivity.class))),new LinearLayout.LayoutParams(0,-2,1));content.addView(actions);
        if(snapshot.comics.isEmpty()){content.addView(Ui.text(this,"还没有完整的手机下载章节。进入 Pica 在线漫画详情可下载单章或全部章节。",14,Ui.MUTED,false));return;}
        for(PhoneDownloadStore.Comic comic:snapshot.comics.values()){
            LinearLayout card=Ui.card(this);card.addView(Ui.text(this,comic.title,17,Ui.TEXT,true));card.addView(Ui.text(this,comic.author+" · "+comic.chapters.size()+" 章 · "+comic.pages()+" 页",12,Ui.MUTED,false));
            LinearLayout row=new LinearLayout(this);row.setPadding(0,Ui.dp(this,8),0,0);row.addView(button("打开",v->open(comic)),new LinearLayout.LayoutParams(0,-2,1));Ui.gap(row,this,8);row.addView(button("删除",v->confirmDelete(comic)),new LinearLayout.LayoutParams(0,-2,1));card.addView(row);content.addView(card);
        }
    }

    private void open(PhoneDownloadStore.Comic comic){Intent i=new Intent(this,UnifiedComicDetailActivity.class);i.putExtra("comicId",comic.id);i.putExtra("title",comic.title);i.putExtra("author",comic.author);startActivity(i);}

    private void confirmDelete(PhoneDownloadStore.Comic comic){
        new AlertDialog.Builder(this)
            .setTitle(LocalizedText.ui("删除手机下载？"))
            .setMessage(LocalizedText.ui("删除手机中的主动下载正文，但不会删除 WebDAV、Desktop、Pica 在线内容或收藏。"))
            .setNegativeButton(LocalizedText.ui("取消"),null)
            .setPositiveButton(LocalizedText.ui("删除"),(d,w)->deleteDownload(comic.id))
            .show();
    }

    private void deleteDownload(String comicId){
        final int generation=++loadGeneration;
        renderLoading();
        worker.submit(()->{
            try{
                PhoneDownloadStore.remove(this,comicId);
                DownloadState state=readDownloads();
                runOnUiThread(()->{
                    if(destroyed||generation!=loadGeneration)return;
                    renderList(state);
                });
            }catch(Exception error){
                runOnUiThread(()->{
                    if(destroyed||generation!=loadGeneration)return;
                    Toast.makeText(this,error.getMessage()==null?LocalizedText.ui("删除失败"):error.getMessage(),Toast.LENGTH_LONG).show();
                    loadDownloads();
                });
            }
        });
    }

    private String format(long value){if(value<1024)return value+" B";if(value<1024L*1024)return String.format(Locale.ROOT,"%.1f KB",value/1024.0);if(value<1024L*1024*1024)return String.format(Locale.ROOT,"%.1f MB",value/1024.0/1024.0);return String.format(Locale.ROOT,"%.2f GB",value/1024.0/1024.0/1024.0);}

    @Override protected void onDestroy(){destroyed=true;loadGeneration++;worker.shutdownNow();super.onDestroy();}
}
