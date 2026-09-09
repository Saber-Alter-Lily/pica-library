package com.picalibrary.android;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Unified comic detail opens immediately; source probing happens asynchronously here. */
public final class UnifiedComicDetailActivity extends Activity {
    private final ExecutorService worker = Executors.newFixedThreadPool(2);
    private LinearLayout content;
    private TextView sourceState;
    private ProgressBar loading;
    private UnifiedCatalogStore.Entry entry;
    private boolean destroyed;

    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);String comicId = getIntent().getStringExtra("comicId");entry = UnifiedCatalogStore.load(this).byId.get(comicId);
        if (entry == null) entry = new UnifiedCatalogStore.Entry(comicId == null ? "" : comicId,getIntent().getStringExtra("title"), getIntent().getStringExtra("author"));render();resolveSource();
    }

    private void render() {
        getWindow().setStatusBarColor(Ui.BG);getWindow().setNavigationBarColor(Ui.BG);LinearLayout root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);root.setBackgroundColor(Ui.BG);root.setOnApplyWindowInsetsListener((v,insets)->{v.setPadding(0,insets.getSystemWindowInsetTop(),0,insets.getSystemWindowInsetBottom());return insets;});
        LinearLayout bar=new LinearLayout(this);bar.setGravity(Gravity.CENTER_VERTICAL);bar.setPadding(Ui.dp(this,6),Ui.dp(this,4),Ui.dp(this,10),Ui.dp(this,4));Button back=new Button(this);back.setText("‹");back.setTextSize(28);back.setAllCaps(false);back.setOnClickListener(v->finish());bar.addView(back,new LinearLayout.LayoutParams(Ui.dp(this,52),Ui.dp(this,52)));bar.addView(Ui.text(this,"漫画详情",20,Ui.TEXT,true),new LinearLayout.LayoutParams(0,-2,1));root.addView(bar);
        ScrollView scroll=new ScrollView(this);content=new LinearLayout(this);content.setOrientation(LinearLayout.VERTICAL);content.setPadding(Ui.dp(this,16),Ui.dp(this,6),Ui.dp(this,16),Ui.dp(this,28));scroll.addView(content,new ScrollView.LayoutParams(-1,-2));root.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));
        LinearLayout hero=new LinearLayout(this);hero.setPadding(0,0,0,Ui.dp(this,16));ImageView cover=new ImageView(this);cover.setScaleType(ImageView.ScaleType.CENTER_CROP);cover.setBackgroundColor(0xffebe8ef);hero.addView(cover,new LinearLayout.LayoutParams(Ui.dp(this,132),Ui.dp(this,188)));loadCover(cover);
        LinearLayout copy=new LinearLayout(this);copy.setOrientation(LinearLayout.VERTICAL);copy.setPadding(Ui.dp(this,15),Ui.dp(this,3),0,0);TextView title=Ui.text(this,entry.title,21,Ui.TEXT,true);title.setMaxLines(4);copy.addView(title);Ui.gap(copy,this,8);copy.addView(Ui.text(this,entry.displayAuthor(),14,Ui.MUTED,false));Ui.gap(copy,this,10);copy.addView(Ui.text(this,availabilityLabel(),12,Ui.PRIMARY,false));hero.addView(copy,new LinearLayout.LayoutParams(0,-2,1));content.addView(hero);
        sourceState=Ui.text(this,"正在检查最快可用的阅读来源…",13,Ui.MUTED,false);content.addView(sourceState);loading=new ProgressBar(this);content.addView(loading);setContentView(root);root.requestApplyInsets();
    }

    private String availabilityLabel(){List<String> values=new ArrayList<>();if(PhoneDownloadStore.has(this,entry.id)||entry.phoneDownloaded)values.add("手机已下载");if(entry.desktopDownloaded)values.add("电脑");if(entry.remoteAvailable)values.add("WebDAV");if(entry.picaAvailable||PicaAccountStore.load(this).configured())values.add("Pica 在线");if(values.isEmpty())values.add("当前只有元数据");return String.join(" · ",values);}
    private void loadCover(ImageView cover){if(entry.remoteAvailable && entry.remoteCoverPath!=null && !entry.remoteCoverPath.isEmpty()){worker.submit(()->{try{android.graphics.Bitmap bitmap=new RemoteLibraryClient(this).bitmap(entry.remoteCoverPath);runOnUiThread(()->{if(!destroyed)cover.setImageBitmap(bitmap);});}catch(Exception ignored){fallbackDesktopCover(cover);}});}else fallbackDesktopCover(cover);}
    private void fallbackDesktopCover(ImageView cover){if(entry.desktopCoverPath!=null&&!entry.desktopCoverPath.isEmpty())runOnUiThread(()->ImageRepository.load(this,cover,entry.desktopCoverPath,0xffebe8ef));}

    private void resolveSource(){
        worker.submit(()->{
            if(PhoneDownloadStore.has(this,entry.id))try{ReaderSource source=new PhoneDownloadReaderSource(this);List<BridgeClient.ChapterItem> chapters=readable(source.chapters(entry.id));if(!chapters.isEmpty()){showResolved("phone","手机已下载",chapters);return;}}catch(Exception ignored){}
            if(entry.desktopDownloaded && BridgeStore.paired(this))try{BridgeClient.device(this);ReaderSource source=new DesktopReaderSource(this);List<BridgeClient.ChapterItem> chapters=readable(source.chapters(entry.id));if(!chapters.isEmpty()){showResolved("desktop","电脑局域网",chapters);return;}}catch(Exception ignored){}
            if(entry.remoteAvailable && RemoteConfigStore.load(this).configured())try{ReaderSource source=new RemoteReaderSource(this);List<BridgeClient.ChapterItem> chapters=readable(source.chapters(entry.id));if(!chapters.isEmpty()){showResolved("remote","WebDAV 云端",chapters);return;}}catch(Exception ignored){}
            if(PicaAccountStore.load(this).configured())try{PicaClient client=new PicaClient(this);PicaClient.Comic online=client.comic(entry.id);if(!online.id.isEmpty()){entry=UnifiedPicaCatalogSync.merge(this,online);ReaderSource source=new PicaReaderSource(this);List<BridgeClient.ChapterItem> chapters=source.chapters(entry.id);if(!chapters.isEmpty()){showResolved("pica","Pica 在线",chapters);return;}}}catch(Exception ignored){}
            runOnUiThread(()->{if(destroyed)return;loading.setVisibility(View.GONE);sourceState.setText(PicaAccountStore.load(this).configured()?"当前没有可读正文来源；Pica 在线也未找到这本漫画。":"当前没有可读正文来源。配置 Pica 账号后，手机会继续尝试在线读取。");if(!PicaAccountStore.load(this).configured()){Button login=new Button(this);login.setText("配置 Pica 在线");login.setAllCaps(false);login.setOnClickListener(v->startActivity(new Intent(this,PicaAccountActivity.class)));content.addView(login);}});
        });
    }

    private List<BridgeClient.ChapterItem> readable(List<BridgeClient.ChapterItem> source){List<BridgeClient.ChapterItem> out=new ArrayList<>();for(BridgeClient.ChapterItem item:source)if(item.downloadedPictures>0)out.add(item);out.sort(Comparator.comparingInt(item->item.order));return out;}
    private void showResolved(String sourceKind,String label,List<BridgeClient.ChapterItem> chapters){runOnUiThread(()->{if(destroyed)return;loading.setVisibility(View.GONE);sourceState.setText("当前阅读来源："+label+" · "+chapters.size()+" 个章节");if("pica".equals(sourceKind)){Button all=new Button(this);all.setText("下载全部章节到手机");all.setAllCaps(false);all.setOnClickListener(v->{PicaDownloadJobs.enqueue(this,entry.id,"");Toast.makeText(this,"已加入后台下载，可离开本页继续使用 App",Toast.LENGTH_LONG).show();});content.addView(all);}TextView section=Ui.text(this,"可读章节",20,Ui.TEXT,true);section.setPadding(0,Ui.dp(this,14),0,Ui.dp(this,6));content.addView(section);for(BridgeClient.ChapterItem chapter:chapters){LinearLayout row=Ui.card(this);row.setPadding(Ui.dp(this,15),Ui.dp(this,12),Ui.dp(this,15),Ui.dp(this,12));row.addView(Ui.text(this,chapter.title,15.5f,Ui.TEXT,true));row.addView(Ui.text(this,"pica".equals(sourceKind)?"在线读取 · "+label:chapter.downloadedPictures+" 页 · "+label,11.5f,Ui.MUTED,false));row.setOnClickListener(v->openReader(sourceKind,chapter.id));if("pica".equals(sourceKind)){Button download=new Button(this);download.setText("下载本章");download.setAllCaps(false);download.setOnClickListener(v->{PicaDownloadJobs.enqueue(this,entry.id,chapter.id);Toast.makeText(this,"本章已加入后台下载",Toast.LENGTH_SHORT).show();});row.addView(download);}content.addView(row);}});}
    private void openReader(String sourceKind,String episodeId){Intent i=new Intent(this,ReaderActivity.class);i.putExtra("comicId",entry.id);i.putExtra("title",entry.title);i.putExtra("episodeId",episodeId);i.putExtra("source",sourceKind);startActivity(i);}
    @Override protected void onDestroy(){destroyed=true;worker.shutdownNow();super.onDestroy();}
}
