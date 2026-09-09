package com.picalibrary.android;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.os.Bundle;
import android.view.Gravity;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import java.util.Locale;

/** Persistent phone downloads are managed separately from disposable reader cache. */
public final class DownloadsActivity extends Activity {
    private LinearLayout content;
    @Override public void onCreate(Bundle saved){super.onCreate(saved);getWindow().setStatusBarColor(Ui.BG);getWindow().setNavigationBarColor(Ui.BG);render();}
    @Override protected void onResume(){super.onResume();renderList();}
    private Button button(String label,android.view.View.OnClickListener action){Button b=new Button(this);b.setText(label);b.setAllCaps(false);b.setTextColor(Ui.PRIMARY);b.setOnClickListener(action);return b;}
    private void render(){LinearLayout root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);root.setBackgroundColor(Ui.BG);root.setOnApplyWindowInsetsListener((v,i)->{v.setPadding(0,i.getSystemWindowInsetTop(),0,i.getSystemWindowInsetBottom());return i;});LinearLayout bar=new LinearLayout(this);bar.setGravity(Gravity.CENTER_VERTICAL);bar.addView(button("‹ 返回",v->finish()));bar.addView(Ui.text(this,"手机下载",22,Ui.TEXT,true),new LinearLayout.LayoutParams(0,-2,1));root.addView(bar);ScrollView scroll=new ScrollView(this);content=new LinearLayout(this);content.setOrientation(LinearLayout.VERTICAL);content.setPadding(Ui.dp(this,12),Ui.dp(this,6),Ui.dp(this,12),Ui.dp(this,24));scroll.addView(content);root.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));setContentView(root);root.requestApplyInsets();renderList();}
    private void renderList(){if(content==null)return;content.removeAllViews();PhoneDownloadStore.Snapshot snapshot=PhoneDownloadStore.load(this);content.addView(Ui.text(this,"主动下载属于持久文件，不受阅读缓存上限和 LRU 清理影响。当前约 "+format(PhoneDownloadStore.estimatedBytes(this))+"。",12,Ui.MUTED,false));content.addView(button("下载位置与缓存设置",v->startActivity(new Intent(this,StorageSettingsActivity.class))));if(snapshot.comics.isEmpty()){content.addView(Ui.text(this,"还没有手机下载。进入 Pica 在线漫画详情后可下载单章或全部章节。",14,Ui.MUTED,false));return;}for(PhoneDownloadStore.Comic comic:snapshot.comics.values()){LinearLayout card=Ui.card(this);card.addView(Ui.text(this,comic.title,17,Ui.TEXT,true));card.addView(Ui.text(this,comic.author+" · "+comic.chapters.size()+" 章 · "+comic.pages()+" 页",12,Ui.MUTED,false));LinearLayout row=new LinearLayout(this);row.addView(button("打开",v->open(comic)),new LinearLayout.LayoutParams(0,-2,1));row.addView(button("删除",v->confirmDelete(comic)),new LinearLayout.LayoutParams(0,-2,1));card.addView(row);content.addView(card);}}
    private void open(PhoneDownloadStore.Comic comic){Intent i=new Intent(this,UnifiedComicDetailActivity.class);i.putExtra("comicId",comic.id);i.putExtra("title",comic.title);i.putExtra("author",comic.author);startActivity(i);}
    private void confirmDelete(PhoneDownloadStore.Comic comic){new AlertDialog.Builder(this).setTitle("删除手机下载？").setMessage("将删除手机中主动下载的《"+comic.title+"》正文，但不会删除 WebDAV、Desktop 或 Pica 在线内容，也不会清除收藏。") .setNegativeButton("取消",null).setPositiveButton("删除",(d,w)->{PhoneDownloadStore.remove(this,comic.id);renderList();}).show();}
    private String format(long value){if(value<1024)return value+" B";if(value<1024L*1024)return String.format(Locale.ROOT,"%.1f KB",value/1024.0);if(value<1024L*1024*1024)return String.format(Locale.ROOT,"%.1f MB",value/1024.0/1024.0);return String.format(Locale.ROOT,"%.2f GB",value/1024.0/1024.0/1024.0);}
}
