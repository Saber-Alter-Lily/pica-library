package com.picalibrary.android;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Bitmap;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.WindowInsets;
import android.widget.Button;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.TextView;
import java.util.ArrayList;
import java.util.List;

public class ComicDetailActivity extends Activity {
    private String comicId,title,author,coverPath;
    private int downloadedPictures;
    private LinearLayout content;
    private ProgressBar loading;

    @Override public void onCreate(Bundle b){
        super.onCreate(b);
        comicId=getIntent().getStringExtra("comicId");title=getIntent().getStringExtra("title");author=getIntent().getStringExtra("author");coverPath=getIntent().getStringExtra("coverPath");downloadedPictures=getIntent().getIntExtra("downloadedPictures",0);
        render();load();
    }

    private void render(){
        LinearLayout root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);root.setBackgroundColor(Ui.BG);
        root.setOnApplyWindowInsetsListener((v,insets)->{v.setPadding(0,insets.getSystemWindowInsetTop(),0,insets.getSystemWindowInsetBottom());return insets;});
        LinearLayout bar=new LinearLayout(this);bar.setGravity(Gravity.CENTER_VERTICAL);bar.setPadding(Ui.dp(this,12),Ui.dp(this,8),Ui.dp(this,12),Ui.dp(this,8));
        Button back=new Button(this);back.setText("‹");back.setTextSize(28);back.setAllCaps(false);back.setOnClickListener(v->finish());bar.addView(back,new LinearLayout.LayoutParams(Ui.dp(this,52),Ui.dp(this,52)));
        TextView heading=Ui.text(this,"漫画详情",22,Ui.TEXT,true);bar.addView(heading,new LinearLayout.LayoutParams(0,-2,1));root.addView(bar);
        ScrollView scroll=new ScrollView(this);content=new LinearLayout(this);content.setOrientation(LinearLayout.VERTICAL);content.setPadding(Ui.dp(this,18),Ui.dp(this,8),Ui.dp(this,18),Ui.dp(this,24));scroll.addView(content,new ScrollView.LayoutParams(-1,-2));root.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));
        setContentView(root);root.requestApplyInsets();
    }

    private void load(){
        LinearLayout hero=new LinearLayout(this);hero.setPadding(0,0,0,Ui.dp(this,18));
        ImageView cover=new ImageView(this);cover.setScaleType(ImageView.ScaleType.CENTER_CROP);cover.setBackgroundColor(0xffebe8ef);hero.addView(cover,new LinearLayout.LayoutParams(Ui.dp(this,126),Ui.dp(this,178)));
        LinearLayout copy=new LinearLayout(this);copy.setOrientation(LinearLayout.VERTICAL);copy.setPadding(Ui.dp(this,16),0,0,0);copy.addView(Ui.text(this,title==null?"未命名漫画":title,22,Ui.TEXT,true));Ui.gap(copy,this,8);copy.addView(Ui.text(this,author==null?"未知作者":author,14,Ui.MUTED,false));Ui.gap(copy,this,12);copy.addView(Ui.pill(this,"电脑已下载 "+downloadedPictures+" 页",Ui.PRIMARY_SOFT,Ui.PRIMARY));hero.addView(copy,new LinearLayout.LayoutParams(0,-2,1));content.addView(hero);
        if(coverPath!=null&&!coverPath.isEmpty())new Thread(()->{try{Bitmap b=BridgeClient.bitmap(this,coverPath);runOnUiThread(()->cover.setImageBitmap(b));}catch(Exception ignored){}}).start();
        TextView section=Ui.text(this,"已下载章节",20,Ui.TEXT,true);content.addView(section);Ui.gap(content,this,8);
        loading=new ProgressBar(this);content.addView(loading);
        new Thread(()->{try{
            List<BridgeClient.ChapterItem> all=BridgeClient.chapters(this,comicId);List<BridgeClient.ChapterItem> downloaded=new ArrayList<>();for(BridgeClient.ChapterItem c:all)if(c.downloadedPictures>0)downloaded.add(c);
            runOnUiThread(()->showChapters(downloaded));
        }catch(Exception e){runOnUiThread(()->{loading.setVisibility(View.GONE);TextView error=Ui.text(this,"章节读取失败："+e.getMessage(),14,0xffa43b3b,false);content.addView(error);});}}).start();
    }

    private void showChapters(List<BridgeClient.ChapterItem> chapters){
        loading.setVisibility(View.GONE);
        if(chapters.isEmpty()){content.addView(Ui.text(this,"没有可读取的本地章节。",14,Ui.MUTED,false));return;}
        for(BridgeClient.ChapterItem c:chapters){
            LinearLayout row=Ui.card(this);row.setPadding(Ui.dp(this,16),Ui.dp(this,14),Ui.dp(this,16),Ui.dp(this,14));row.addView(Ui.text(this,c.title,16,Ui.TEXT,true));row.addView(Ui.text(this,"已下载 "+c.downloadedPictures+" 页",12,Ui.MUTED,false));row.setOnClickListener(v->{Intent i=new Intent(this,ReaderActivity.class);i.putExtra("comicId",comicId);i.putExtra("title",title);i.putExtra("episodeId",c.id);startActivity(i);});content.addView(row);
        }
    }
}
