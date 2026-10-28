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
        LinearLayout bar=new LinearLayout(this);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setPadding(Ui.dp(this,6),Ui.dp(this,6),Ui.dp(this,8),Ui.dp(this,4));
        bar.addView(Ui.button(this,getString(R.string.common_back),v->finish(),true));
        TextView heading=Ui.text(this,getString(R.string.phone_downloads_title),22,Ui.TEXT,true);
        heading.setTag("phone-downloads-heading");
        heading.setMaxLines(2);
        bar.addView(heading,new LinearLayout.LayoutParams(0,-2,1));
        Button tasks=Ui.button(this,getString(R.string.phone_downloads_tasks_short),v->startActivity(new Intent(this,TaskCenterActivity.class)),true);
        tasks.setTag(AndroidOnboarding.ADV_DOWNLOAD_TASKS);
        bar.addView(tasks);root.addView(bar);
        ScrollView scroll=new ScrollView(this);scroll.setBackgroundColor(Ui.BG);content=new LinearLayout(this);content.setOrientation(LinearLayout.VERTICAL);content.setPadding(Ui.dp(this,12),Ui.dp(this,6),Ui.dp(this,12),Ui.dp(this,24));scroll.addView(content);root.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));setContentView(root);root.requestApplyInsets();renderLoading();
    }

    private void renderLoading(){
        if(content==null)return;
        content.removeAllViews();
        ProgressBar progress=new ProgressBar(this);content.addView(progress);
        TextView text=Ui.text(this,getString(R.string.phone_downloads_loading),13,Ui.MUTED,false);text.setPadding(0,Ui.dp(this,8),0,0);content.addView(text);
    }

    private DownloadState readDownloads(){
        PhoneDownloadStore.Snapshot snapshot=PhoneDownloadStore.load(this);
        return new DownloadState(snapshot,snapshot.readError?0:PhoneDownloadStore.estimatedBytes(this,snapshot));
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
        if(snapshot.readError){
            content.addView(Ui.text(this,getString(R.string.phone_downloads_index_error),14,Ui.BAD,true));
            // No Delete/Refresh actions that could mask a recoverable index.
            return;
        }
        content.addView(Ui.text(this,getString(R.string.phone_downloads_note,format(state.bytes)),12,Ui.MUTED,false));
        LinearLayout actions=new LinearLayout(this);
        actions.setGravity(Gravity.CENTER_VERTICAL);
        actions.setPadding(0,Ui.dp(this,8),0,Ui.dp(this,8));
        Button background=button(getString(R.string.phone_downloads_background_tasks),
            v->startActivity(new Intent(this,TaskCenterActivity.class)));
        background.setTag("phone-downloads-background-tasks");
        actions.addView(background,new LinearLayout.LayoutParams(0,-2,1));
        Ui.gap(actions,this,8);
        Button storage=button(getString(R.string.phone_downloads_storage_settings),
            v->startActivity(new Intent(this,StorageSettingsActivity.class)));
        storage.setTag(AndroidOnboarding.ADV_DOWNLOAD_STORAGE);
        actions.addView(storage,new LinearLayout.LayoutParams(0,-2,1));
        content.addView(actions);
        if(snapshot.comics.isEmpty()){content.addView(Ui.text(this,getString(R.string.phone_download_empty_sources),14,Ui.MUTED,false));return;}
        for(PhoneDownloadStore.Comic comic:snapshot.comics.values()){
            LinearLayout card=Ui.card(this);card.addView(Ui.text(this,comic.title,17,Ui.TEXT,true));card.addView(Ui.text(this,comic.author+" · "+getString(R.string.phone_downloads_chapter_page_count,comic.chapters.size(),comic.pages()),12,Ui.MUTED,false));
            LinearLayout row=new LinearLayout(this);row.setPadding(0,Ui.dp(this,8),0,0);row.addView(button(getString(R.string.phone_downloads_open),v->open(comic)),new LinearLayout.LayoutParams(0,-2,1));Ui.gap(row,this,8);row.addView(button(getString(R.string.phone_downloads_delete),v->confirmDelete(comic)),new LinearLayout.LayoutParams(0,-2,1));card.addView(row);content.addView(card);
        }
    }

    private void open(PhoneDownloadStore.Comic comic){Intent i=new Intent(this,UnifiedComicDetailActivity.class);i.putExtra("comicId",comic.id);i.putExtra("title",comic.title);i.putExtra("author",comic.author);startActivity(i);}

    private void confirmDelete(PhoneDownloadStore.Comic comic){
        new AlertDialog.Builder(this)
            .setTitle(R.string.phone_downloads_delete_title)
            .setMessage(getString(R.string.phone_download_delete_scope))
            .setNegativeButton(R.string.phone_downloads_cancel,null)
            .setPositiveButton(R.string.phone_downloads_delete,(d,w)->deleteDownload(comic.id))
            .show();
    }

    private void deleteDownload(String comicId){
        final int generation=++loadGeneration;
        renderLoading();
        worker.submit(()->{
            try{
                if(comicId.startsWith("jm:")){
                    JmDownloadJobs.cancel(this,comicId);
                    androidx.work.WorkManager.getInstance(this).cancelUniqueWork(JmDownloadJobs.name(comicId)).getResult().get(10,TimeUnit.SECONDS);
                    JmDownloadEngine.removeCompletedDownload(this,comicId);
                }else PhoneDownloadStore.remove(this,comicId);
                DownloadState state=readDownloads();
                runOnUiThread(()->{
                    if(destroyed||generation!=loadGeneration)return;
                    renderList(state);
                });
            }catch(Exception error){
                runOnUiThread(()->{
                    if(destroyed||generation!=loadGeneration)return;
                    Toast.makeText(this,error.getMessage()==null?getString(R.string.phone_downloads_delete_failed):error.getMessage(),Toast.LENGTH_LONG).show();
                    loadDownloads();
                });
            }
        });
    }

    private String format(long value){if(value<1024)return value+" B";if(value<1024L*1024)return String.format(Locale.ROOT,"%.1f KB",value/1024.0);if(value<1024L*1024*1024)return String.format(Locale.ROOT,"%.1f MB",value/1024.0/1024.0);return String.format(Locale.ROOT,"%.2f GB",value/1024.0/1024.0/1024.0);}

    @Override protected void onDestroy(){destroyed=true;loadGeneration++;worker.shutdownNow();super.onDestroy();}
}
