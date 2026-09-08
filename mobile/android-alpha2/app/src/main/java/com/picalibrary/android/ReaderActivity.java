package com.picalibrary.android;

import android.app.Activity;
import android.app.AlertDialog;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.os.Bundle;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowInsets;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.SeekBar;
import android.widget.TextView;
import java.util.ArrayList;
import java.util.List;

public class ReaderActivity extends Activity {
    private FrameLayout root;
    private ZoomImageView image;
    private LinearLayout topBar,bottomBar;
    private TextView titleView,pageView;
    private ProgressBar loading;
    private SeekBar seek;
    private String comicId,title,episodeId;
    private List<BridgeClient.PageItem> pages;
    private List<BridgeClient.ChapterItem> chapters=new ArrayList<>();
    private int index=0;
    private int loadSerial=0;
    private boolean chromeVisible=true;

    @Override public void onCreate(Bundle b){
        super.onCreate(b);
        getWindow().setStatusBarColor(Color.BLACK);
        getWindow().setNavigationBarColor(Color.BLACK);
        comicId=getIntent().getStringExtra("comicId");
        title=getIntent().getStringExtra("title");
        episodeId=getIntent().getStringExtra("episodeId");
        render();
        loadChapter();
    }

    private void render(){
        root=new FrameLayout(this);root.setBackgroundColor(Color.BLACK);
        root.setOnApplyWindowInsetsListener((v,insets)->{v.setPadding(0,insets.getSystemWindowInsetTop(),0,insets.getSystemWindowInsetBottom());return insets;});
        image=new ZoomImageView(this);image.setBackgroundColor(Color.BLACK);image.setNavigationListener(new ZoomImageView.NavigationListener(){
            @Override public void onPrevious(){flip(-1);}
            @Override public void onNext(){flip(1);}
            @Override public void onCenterTap(){toggleChrome();}
        });
        root.addView(image,new FrameLayout.LayoutParams(-1,-1));

        loading=new ProgressBar(this);FrameLayout.LayoutParams lp=new FrameLayout.LayoutParams(Ui.dp(this,44),Ui.dp(this,44),Gravity.CENTER);root.addView(loading,lp);

        topBar=new LinearLayout(this);topBar.setGravity(Gravity.CENTER_VERTICAL);topBar.setPadding(Ui.dp(this,8),Ui.dp(this,6),Ui.dp(this,8),Ui.dp(this,6));topBar.setBackgroundColor(0xcc111111);
        Button back=darkButton("‹");back.setTextSize(28);back.setOnClickListener(v->finish());topBar.addView(back,new LinearLayout.LayoutParams(Ui.dp(this,48),Ui.dp(this,48)));
        LinearLayout titles=new LinearLayout(this);titles.setOrientation(LinearLayout.VERTICAL);titleView=Ui.text(this,title==null?"漫画":title,15,Color.WHITE,true);titleView.setMaxLines(1);pageView=Ui.text(this,"正在读取章节…",12,0xffd0d0d0,false);titles.addView(titleView);titles.addView(pageView);topBar.addView(titles,new LinearLayout.LayoutParams(0,-2,1));
        Button chapter=darkButton("章节");chapter.setOnClickListener(v->showChapterPicker());topBar.addView(chapter,new LinearLayout.LayoutParams(Ui.dp(this,64),Ui.dp(this,48)));
        FrameLayout.LayoutParams tp=new FrameLayout.LayoutParams(-1,-2,Gravity.TOP);root.addView(topBar,tp);

        bottomBar=new LinearLayout(this);bottomBar.setOrientation(LinearLayout.VERTICAL);bottomBar.setPadding(Ui.dp(this,10),Ui.dp(this,6),Ui.dp(this,10),Ui.dp(this,8));bottomBar.setBackgroundColor(0xdd111111);
        seek=new SeekBar(this);seek.setMax(0);seek.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener(){
            @Override public void onProgressChanged(SeekBar s,int value,boolean fromUser){if(fromUser&&pages!=null&&!pages.isEmpty()){index=Math.max(0,Math.min(value,pages.size()-1));showPage();}}
            @Override public void onStartTrackingTouch(SeekBar s){}
            @Override public void onStopTrackingTouch(SeekBar s){}
        });bottomBar.addView(seek,new LinearLayout.LayoutParams(-1,Ui.dp(this,36)));
        LinearLayout actions=new LinearLayout(this);actions.setGravity(Gravity.CENTER);
        Button prev=darkButton("上一页");prev.setOnClickListener(v->flip(-1));
        Button fit=darkButton("复位");fit.setOnClickListener(v->image.resetZoom());
        Button settings=darkButton("显示");settings.setOnClickListener(v->showDisplayDialog());
        Button next=darkButton("下一页");next.setOnClickListener(v->flip(1));
        actions.addView(prev,new LinearLayout.LayoutParams(0,Ui.dp(this,48),1));actions.addView(fit,new LinearLayout.LayoutParams(0,Ui.dp(this,48),1));actions.addView(settings,new LinearLayout.LayoutParams(0,Ui.dp(this,48),1));actions.addView(next,new LinearLayout.LayoutParams(0,Ui.dp(this,48),1));bottomBar.addView(actions);
        FrameLayout.LayoutParams bp=new FrameLayout.LayoutParams(-1,-2,Gravity.BOTTOM);root.addView(bottomBar,bp);

        setContentView(root);root.requestApplyInsets();
    }

    private Button darkButton(String text){Button b=new Button(this);b.setText(text);b.setAllCaps(false);b.setTextColor(Color.WHITE);b.setTextSize(13);b.setBackgroundColor(Color.TRANSPARENT);return b;}

    private void loadChapter(){
        if(!BridgeStore.paired(this)||comicId==null){loading.setVisibility(View.GONE);pageView.setText("请先连接 Desktop");return;}
        new Thread(()->{try{
            chapters=BridgeClient.chapters(this,comicId);
            String targetId=episodeId;
            if(targetId==null||targetId.isEmpty())for(BridgeClient.ChapterItem c:chapters)if(c.downloadedPictures>0){targetId=c.id;break;}
            if(targetId==null)throw new IllegalStateException("这本漫画没有已下载章节");
            final BridgeClient.ChapterData data=BridgeClient.chapter(this,comicId,targetId);
            runOnUiThread(()->applyChapter(data));
        }catch(Exception e){runOnUiThread(()->{loading.setVisibility(View.GONE);pageView.setText("无法开始阅读："+e.getMessage());});}}).start();
    }

    private void applyChapter(BridgeClient.ChapterData data){
        episodeId=data.episode.id;pages=data.pages;index=Math.min(Math.max(0,data.progressIndex),Math.max(0,pages.size()-1));seek.setMax(Math.max(0,pages.size()-1));titleView.setText((title==null?"漫画":title)+" · "+data.episode.title);showPage();
    }

    private void showPage(){
        if(pages==null||pages.isEmpty()){loading.setVisibility(View.GONE);pageView.setText("该章节没有可读取页面");return;}
        index=Math.max(0,Math.min(pages.size()-1,index));seek.setProgress(index);BridgeClient.PageItem p=pages.get(index);final int serial=++loadSerial;pageView.setText((index+1)+" / "+pages.size());
        Bitmap hit=ImageRepository.cached(p.url);
        if(hit!=null){image.setImageBitmap(hit);image.resetZoom();loading.setVisibility(View.GONE);BridgeClient.saveProgress(this,comicId,episodeId,index);prefetchAround();return;}
        loading.setVisibility(View.VISIBLE);
        new Thread(()->{try{Bitmap b=BridgeClient.bitmap(this,p.url);ImageRepository.put(p.url,b);runOnUiThread(()->{if(serial!=loadSerial)return;image.setImageBitmap(b);image.resetZoom();loading.setVisibility(View.GONE);BridgeClient.saveProgress(this,comicId,episodeId,index);prefetchAround();});}catch(Exception e){runOnUiThread(()->{if(serial!=loadSerial)return;loading.setVisibility(View.GONE);pageView.setText("页面读取失败："+e.getMessage());});}}).start();
    }

    private void prefetchAround(){
        if(pages==null)return;int[] offsets={1,2,-1};for(int d:offsets){int i=index+d;if(i>=0&&i<pages.size())ImageRepository.prefetch(this,pages.get(i).url);}
    }

    private void flip(int d){
        if(pages==null||pages.isEmpty())return;
        int next=index+d;
        if(next>=0&&next<pages.size()){index=next;showPage();return;}
        switchChapter(d>0?1:-1);
    }

    private void switchChapter(int direction){
        if(chapters==null||chapters.isEmpty())return;int current=-1;for(int i=0;i<chapters.size();i++)if(chapters.get(i).id.equals(episodeId)){current=i;break;}
        for(int i=current+direction;i>=0&&i<chapters.size();i+=direction){BridgeClient.ChapterItem c=chapters.get(i);if(c.downloadedPictures<=0)continue;loadSpecificChapter(c.id);return;}
    }

    private void loadSpecificChapter(String id){
        loading.setVisibility(View.VISIBLE);new Thread(()->{try{BridgeClient.ChapterData data=BridgeClient.chapter(this,comicId,id);runOnUiThread(()->applyChapter(data));}catch(Exception e){runOnUiThread(()->{loading.setVisibility(View.GONE);pageView.setText("章节读取失败："+e.getMessage());});}}).start();
    }

    private void showChapterPicker(){
        List<BridgeClient.ChapterItem> available=new ArrayList<>();for(BridgeClient.ChapterItem c:chapters)if(c.downloadedPictures>0)available.add(c);
        String[] labels=new String[available.size()];for(int i=0;i<available.size();i++)labels[i]=available.get(i).title+" · "+available.get(i).downloadedPictures+" 页";
        new AlertDialog.Builder(this).setTitle("选择章节").setItems(labels,(d,which)->loadSpecificChapter(available.get(which).id)).setNegativeButton("取消",null).show();
    }

    private void showDisplayDialog(){
        String[] items={"黑色背景","深灰背景","白色背景","保持屏幕常亮"};
        new AlertDialog.Builder(this).setTitle("阅读显示").setItems(items,(d,which)->{
            if(which==0){root.setBackgroundColor(Color.BLACK);image.setBackgroundColor(Color.BLACK);}
            else if(which==1){root.setBackgroundColor(0xff303030);image.setBackgroundColor(0xff303030);}
            else if(which==2){root.setBackgroundColor(Color.WHITE);image.setBackgroundColor(Color.WHITE);}
            else getWindow().addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        }).setNegativeButton("关闭",null).show();
    }

    private void toggleChrome(){
        chromeVisible=!chromeVisible;topBar.setVisibility(chromeVisible?View.VISIBLE:View.GONE);bottomBar.setVisibility(chromeVisible?View.VISIBLE:View.GONE);
        if(!chromeVisible)getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_FULLSCREEN|View.SYSTEM_UI_FLAG_HIDE_NAVIGATION|View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);else getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_VISIBLE);
    }

    @Override public boolean onKeyDown(int keyCode,KeyEvent event){if(keyCode==KeyEvent.KEYCODE_VOLUME_UP){flip(-1);return true;}if(keyCode==KeyEvent.KEYCODE_VOLUME_DOWN){flip(1);return true;}return super.onKeyDown(keyCode,event);}
}
