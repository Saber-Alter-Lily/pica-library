package com.picalibrary.android;

import android.app.Activity;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.os.Bundle;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.View;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;
import java.util.List;

public class ReaderActivity extends Activity {
    private FrameLayout root;private ImageView image;private LinearLayout controls;private TextView info;private ProgressBar loading;
    private String comicId,title,episodeId;private List<BridgeClient.PageItem> pages;private int index=0;private int loadSerial=0;

    @Override public void onCreate(Bundle b){
        super.onCreate(b);getWindow().setStatusBarColor(Color.BLACK);getWindow().setNavigationBarColor(Color.BLACK);
        comicId=getIntent().getStringExtra("comicId");title=getIntent().getStringExtra("title");episodeId=getIntent().getStringExtra("episodeId");render();loadChapter();
    }

    private void render(){
        root=new FrameLayout(this);root.setBackgroundColor(0xff111111);
        root.setOnApplyWindowInsetsListener((v,insets)->{v.setPadding(0,insets.getSystemWindowInsetTop(),0,insets.getSystemWindowInsetBottom());return insets;});
        image=new ImageView(this);image.setBackgroundColor(0xff111111);image.setScaleType(ImageView.ScaleType.FIT_CENTER);root.addView(image,new FrameLayout.LayoutParams(-1,-1));
        info=Ui.text(this,"正在读取章节…",14,Color.WHITE,true);info.setPadding(Ui.dp(this,12),Ui.dp(this,8),Ui.dp(this,12),Ui.dp(this,8));info.setBackgroundColor(0xaa000000);FrameLayout.LayoutParams ip=new FrameLayout.LayoutParams(-2,-2,Gravity.TOP|Gravity.CENTER_HORIZONTAL);ip.topMargin=Ui.dp(this,12);root.addView(info,ip);
        loading=new ProgressBar(this);FrameLayout.LayoutParams lp=new FrameLayout.LayoutParams(Ui.dp(this,44),Ui.dp(this,44),Gravity.CENTER);root.addView(loading,lp);
        controls=new LinearLayout(this);controls.setGravity(Gravity.CENTER);controls.setBackgroundColor(0xdd17151b);
        Button prev=button("上一页");prev.setOnClickListener(v->flip(-1));Button chapters=button("返回章节");chapters.setOnClickListener(v->finish());Button settings=button("设置");settings.setOnClickListener(v->Toast.makeText(this,"阅读器高级设置将在后续迭代接入",Toast.LENGTH_SHORT).show());Button next=button("下一页");next.setOnClickListener(v->flip(1));
        controls.addView(prev,new LinearLayout.LayoutParams(0,Ui.dp(this,58),1));controls.addView(chapters,new LinearLayout.LayoutParams(0,Ui.dp(this,58),1));controls.addView(settings,new LinearLayout.LayoutParams(0,Ui.dp(this,58),1));controls.addView(next,new LinearLayout.LayoutParams(0,Ui.dp(this,58),1));root.addView(controls,new FrameLayout.LayoutParams(-1,-2,Gravity.BOTTOM));
        root.setOnTouchListener((v,e)->{if(e.getAction()==MotionEvent.ACTION_UP&&e.getY()<root.getHeight()-Ui.dp(this,80)){float x=e.getX();if(x<root.getWidth()*0.28f)flip(-1);else if(x>root.getWidth()*0.72f)flip(1);else toggleControls();}return true;});setContentView(root);root.requestApplyInsets();
    }

    private void loadChapter(){
        if(!BridgeStore.paired(this)||comicId==null){loading.setVisibility(View.GONE);info.setText("请先连接 Desktop");return;}
        new Thread(()->{try{
            String targetId=episodeId;
            if(targetId==null||targetId.isEmpty()){
                List<BridgeClient.ChapterItem> chapters=BridgeClient.chapters(this,comicId);
                for(BridgeClient.ChapterItem c:chapters)if(c.downloadedPictures>0){targetId=c.id;break;}
            }
            if(targetId==null)throw new IllegalStateException("这本漫画没有已下载章节");
            final BridgeClient.ChapterData data=BridgeClient.chapter(this,comicId,targetId);
            runOnUiThread(()->{episodeId=data.episode.id;pages=data.pages;index=Math.min(Math.max(0,data.progressIndex),Math.max(0,pages.size()-1));showPage();});
        }catch(Exception e){runOnUiThread(()->{loading.setVisibility(View.GONE);info.setText("无法开始阅读："+e.getMessage());});}}).start();
    }

    private void showPage(){
        if(pages==null||pages.isEmpty()){loading.setVisibility(View.GONE);info.setText("该章节没有可读取页面");return;}
        index=Math.max(0,Math.min(pages.size()-1,index));BridgeClient.PageItem p=pages.get(index);final int serial=++loadSerial;loading.setVisibility(View.VISIBLE);info.setText((title==null?"漫画":title)+" · "+(index+1)+" / "+pages.size());
        new Thread(()->{try{Bitmap b=BridgeClient.bitmap(this,p.url);runOnUiThread(()->{if(serial!=loadSerial)return;image.setImageBitmap(b);loading.setVisibility(View.GONE);BridgeClient.saveProgress(this,comicId,episodeId,index);});}catch(Exception e){runOnUiThread(()->{if(serial!=loadSerial)return;loading.setVisibility(View.GONE);info.setText("页面读取失败："+e.getMessage());});}}).start();
    }

    private Button button(String s){Button b=new Button(this);b.setText(s);b.setTextColor(Color.WHITE);b.setAllCaps(false);b.setBackgroundColor(Color.TRANSPARENT);return b;}
    private void flip(int d){if(pages==null||pages.isEmpty())return;int next=Math.max(0,Math.min(pages.size()-1,index+d));if(next!=index){index=next;showPage();}}
    private void toggleControls(){controls.setVisibility(controls.getVisibility()==View.VISIBLE?View.GONE:View.VISIBLE);}
    @Override public boolean onKeyDown(int keyCode,KeyEvent event){if(keyCode==KeyEvent.KEYCODE_VOLUME_UP){flip(-1);return true;}if(keyCode==KeyEvent.KEYCODE_VOLUME_DOWN){flip(1);return true;}return super.onKeyDown(keyCode,event);}
}
