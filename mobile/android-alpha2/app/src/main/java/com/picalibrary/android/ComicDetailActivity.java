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
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;

public class ComicDetailActivity extends Activity {
    private String comicId,title,author,coverPath,sourceKind;
    private int downloadedPictures;
    private LinearLayout content;
    private ProgressBar loading;

    @Override public void onCreate(Bundle b){
        super.onCreate(b);getWindow().setStatusBarColor(Ui.BG);getWindow().setNavigationBarColor(Ui.BG);
        comicId=getIntent().getStringExtra("comicId");title=getIntent().getStringExtra("title");author=getIntent().getStringExtra("author");coverPath=getIntent().getStringExtra("coverPath");sourceKind=getIntent().getStringExtra("source");downloadedPictures=getIntent().getIntExtra("downloadedPictures",0);
        render();load();
    }

    private void render(){
        LinearLayout root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);root.setBackgroundColor(Ui.BG);
        root.setOnApplyWindowInsetsListener((v,insets)->{v.setPadding(0,insets.getSystemWindowInsetTop(),0,insets.getSystemWindowInsetBottom());return insets;});
        LinearLayout bar=new LinearLayout(this);bar.setGravity(Gravity.CENTER_VERTICAL);bar.setPadding(Ui.dp(this,6),Ui.dp(this,4),Ui.dp(this,10),Ui.dp(this,4));
        Button back=new Button(this);back.setText("‹");back.setTextSize(28);back.setAllCaps(false);back.setOnClickListener(v->finish());bar.addView(back,new LinearLayout.LayoutParams(Ui.dp(this,52),Ui.dp(this,52)));
        TextView heading=Ui.text(this,"漫画详情",20,Ui.TEXT,true);bar.addView(heading,new LinearLayout.LayoutParams(0,-2,1));root.addView(bar);
        ScrollView scroll=new ScrollView(this);content=new LinearLayout(this);content.setOrientation(LinearLayout.VERTICAL);content.setPadding(Ui.dp(this,16),Ui.dp(this,6),Ui.dp(this,16),Ui.dp(this,28));scroll.addView(content,new ScrollView.LayoutParams(-1,-2));root.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));
        setContentView(root);root.requestApplyInsets();
    }

    private ReaderSource readerSource(){return "remote".equals(sourceKind)?new RemoteReaderSource(this):new DesktopReaderSource(this);}

    private void load(){
        LinearLayout hero=new LinearLayout(this);hero.setPadding(0,0,0,Ui.dp(this,18));
        ImageView cover=new ImageView(this);cover.setScaleType(ImageView.ScaleType.CENTER_CROP);cover.setBackgroundColor(0xffebe8ef);hero.addView(cover,new LinearLayout.LayoutParams(Ui.dp(this,132),Ui.dp(this,188)));
        if("remote".equals(sourceKind))new Thread(()->{try{android.graphics.Bitmap bitmap=new RemoteLibraryClient(this).bitmap(coverPath);runOnUiThread(()->cover.setImageBitmap(bitmap));}catch(Exception ignored){}}).start();else ImageRepository.load(this,cover,coverPath,0xffebe8ef);
        LinearLayout copy=new LinearLayout(this);copy.setOrientation(LinearLayout.VERTICAL);copy.setPadding(Ui.dp(this,15),Ui.dp(this,3),0,0);TextView titleView=Ui.text(this,title==null?"未命名漫画":title,21,Ui.TEXT,true);titleView.setMaxLines(4);copy.addView(titleView);Ui.gap(copy,this,8);copy.addView(Ui.text(this,author==null?"未知作者":author,14,Ui.MUTED,false));Ui.gap(copy,this,12);copy.addView(Ui.pill(this,("remote".equals(sourceKind)?"网盘可读 ":"电脑已下载 ")+downloadedPictures+" 页",Ui.PRIMARY_SOFT,Ui.PRIMARY));hero.addView(copy,new LinearLayout.LayoutParams(0,-2,1));content.addView(hero);
        TextView section=Ui.text(this,"可读章节",20,Ui.TEXT,true);content.addView(section);TextView hint=Ui.text(this,"remote".equals(sourceKind)?"章节图片从 WebDAV 按页流式读取":"只显示电脑端已经完整或部分下载、可直接读取的章节",12,Ui.MUTED,false);hint.setPadding(0,Ui.dp(this,3),0,Ui.dp(this,8));content.addView(hint);
        loading=new ProgressBar(this);content.addView(loading);
        new Thread(()->{try{List<BridgeClient.ChapterItem> all=readerSource().chapters(comicId);List<BridgeClient.ChapterItem> readable=new ArrayList<>();for(BridgeClient.ChapterItem c:all)if(c.downloadedPictures>0)readable.add(c);Collections.sort(readable,Comparator.comparingInt((BridgeClient.ChapterItem c)->c.order).reversed());runOnUiThread(()->showChapters(readable));}catch(Exception e){runOnUiThread(()->{loading.setVisibility(View.GONE);content.addView(Ui.text(this,"章节读取失败："+e.getMessage(),14,0xffa43b3b,false));});}}).start();
    }

    private void showChapters(List<BridgeClient.ChapterItem> chapters){
        loading.setVisibility(View.GONE);
        if(chapters.isEmpty()){content.addView(Ui.text(this,"没有可读取章节。",14,Ui.MUTED,false));return;}
        Button continueRead=new Button(this);continueRead.setText("继续阅读");continueRead.setAllCaps(false);continueRead.setOnClickListener(v->openReader(chapters.get(chapters.size()-1)));content.addView(continueRead,new LinearLayout.LayoutParams(-1,Ui.dp(this,50)));
        Ui.gap(content,this,8);
        for(BridgeClient.ChapterItem c:chapters){LinearLayout row=Ui.card(this);row.setPadding(Ui.dp(this,15),Ui.dp(this,12),Ui.dp(this,15),Ui.dp(this,12));LinearLayout top=new LinearLayout(this);top.setGravity(Gravity.CENTER_VERTICAL);TextView name=Ui.text(this,c.title,15.5f,Ui.TEXT,true);top.addView(name,new LinearLayout.LayoutParams(0,-2,1));top.addView(Ui.text(this,"›",22,Ui.MUTED,false));row.addView(top);row.addView(Ui.text(this,("remote".equals(sourceKind)?"云端 ":"已下载 ")+c.downloadedPictures+" 页",11.5f,Ui.MUTED,false));row.setOnClickListener(v->openReader(c));content.addView(row);}
    }

    private void openReader(BridgeClient.ChapterItem c){Intent i=new Intent(this,ReaderActivity.class);i.putExtra("comicId",comicId);i.putExtra("title",title);i.putExtra("episodeId",c.id);i.putExtra("source",sourceKind);startActivity(i);}
}
