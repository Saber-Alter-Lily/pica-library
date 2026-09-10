package com.picalibrary.android;

import android.content.Context;
import android.content.res.ColorStateList;
import android.graphics.drawable.Drawable;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import androidx.work.Data;
import androidx.work.WorkInfo;
import androidx.work.WorkManager;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

/** Inline recommendation generation status that follows the unique WorkManager job. */
final class RecommendationProgressPanel extends LinearLayout {
    private static final long POLL_MS=500L;
    private final Handler main=new Handler(Looper.getMainLooper());
    private final ExecutorService io=Executors.newSingleThreadExecutor();
    private final AtomicBoolean querying=new AtomicBoolean(false);
    private final Runnable onFinished;
    private final TextView phase,detail;
    private final ProgressBar bar;
    private final FrameLayout progressHost;
    private final ImageView progressHead;
    private boolean attached,sawActive,finishedDispatched;private int wobble=1;

    RecommendationProgressPanel(Context context,Runnable onFinished){
        super(context);this.onFinished=onFinished;setOrientation(VERTICAL);setPadding(Ui.dp(context,14),Ui.dp(context,12),Ui.dp(context,14),Ui.dp(context,12));setBackground(Ui.rounded(Ui.SURFACE,Math.min(18,ThemePackStore.cardRadiusDp(context)),context));setElevation(Ui.dp(context,1));
        Drawable artwork=ThemePackStore.recommendationLoadingDrawable(context);if(artwork!=null){ImageView art=new ImageView(context);art.setImageDrawable(artwork);art.setScaleType(ImageView.ScaleType.CENTER_CROP);LinearLayout.LayoutParams ap=new LinearLayout.LayoutParams(-1,Ui.dp(context,118));ap.setMargins(0,0,0,Ui.dp(context,9));addView(art,ap);}
        phase=Ui.text(context,"正在准备推荐…",15,Ui.TEXT,true);addView(phase);
        detail=Ui.text(context,"",12,Ui.MUTED,false);detail.setPadding(0,Ui.dp(context,5),0,Ui.dp(context,4));addView(detail);
        progressHost=new FrameLayout(context);LinearLayout.LayoutParams hp=new LinearLayout.LayoutParams(-1,Ui.dp(context,32));addView(progressHost,hp);
        bar=new ProgressBar(context,null,android.R.attr.progressBarStyleHorizontal);bar.setProgressTintList(ColorStateList.valueOf(ThemePackStore.progressFill(context)));bar.setProgressBackgroundTintList(ColorStateList.valueOf(ThemePackStore.progressTrack(context)));FrameLayout.LayoutParams bp=new FrameLayout.LayoutParams(-1,Ui.dp(context,7),Gravity.CENTER_VERTICAL);bp.setMargins(Ui.dp(context,2),0,Ui.dp(context,2),0);progressHost.addView(bar,bp);
        progressHead=new ImageView(context);Drawable head=ThemePackStore.mascotHeadDrawable(context);if(head!=null)progressHead.setImageDrawable(head);progressHead.setScaleType(ImageView.ScaleType.FIT_CENTER);FrameLayout.LayoutParams ip=new FrameLayout.LayoutParams(Ui.dp(context,26),Ui.dp(context,26));ip.gravity=Gravity.CENTER_VERTICAL;progressHost.addView(progressHead,ip);progressHead.setVisibility(GONE);if(ThemePackStore.progressSparkle(context))progressHead.setElevation(Ui.dp(context,4));
        setVisibility(GONE);
    }

    void begin(){sawActive=true;finishedDispatched=false;phase.setText("正在启动推荐生成…");detail.setText("请保持网络可用，完成后本区域会自动消失。");bar.setIndeterminate(true);progressHead.setVisibility(GONE);setVisibility(VISIBLE);pollSoon(60);}

    @Override protected void onAttachedToWindow(){super.onAttachedToWindow();attached=true;pollSoon(0);}
    @Override protected void onDetachedFromWindow(){attached=false;main.removeCallbacksAndMessages(null);io.shutdownNow();super.onDetachedFromWindow();}

    private void pollSoon(long delay){if(!attached&&delay>0)return;main.postDelayed(this::query,delay);}
    private void query(){if((!attached&&getWindowToken()==null)||!querying.compareAndSet(false,true))return;io.execute(()->{State state=readState(getContext());main.post(()->{querying.set(false);apply(state);if(attached)pollSoon(POLL_MS);});});}

    private void apply(State state){
        if(state==null){if(!sawActive)setVisibility(GONE);return;}
        if(state.active){sawActive=true;setVisibility(VISIBLE);phase.setText(state.phase);detail.setText(state.detail);if(state.total>0){bar.setIndeterminate(false);bar.setMax(Math.max(1,state.total));bar.setProgress(Math.max(0,Math.min(state.done,state.total)));moveHead(state.done,state.total);}else{bar.setIndeterminate(true);progressHead.setVisibility(GONE);}return;}
        progressHead.setVisibility(GONE);
        if(state.failed){setVisibility(VISIBLE);bar.setIndeterminate(false);bar.setProgress(0);phase.setText("推荐生成失败");detail.setText(state.detail.isEmpty()?"请检查网络后重新生成。":state.detail);return;}
        setVisibility(GONE);
        if(sawActive&&!finishedDispatched&&state.succeeded){finishedDispatched=true;if(onFinished!=null)onFinished.run();}
    }

    private void moveHead(int done,int total){Drawable drawable=progressHead.getDrawable();String style=ThemePackStore.progressStyle(getContext());if(drawable==null||"classic".equals(style)||total<=0){progressHead.setVisibility(GONE);return;}progressHead.setVisibility(VISIBLE);progressHost.post(()->{float ratio=Math.max(0f,Math.min(1f,done/(float)Math.max(1,total)));float x=ratio*Math.max(0,progressHost.getWidth()-progressHead.getWidth());String motion=ThemePackStore.progressMotion(getContext());float y=0f,rotation=0f;if("bobble".equals(motion)){wobble=-wobble;y=Ui.dp(getContext(),2)*wobble;rotation=4f*wobble;}else if("hop".equals(motion)){wobble=-wobble;y=wobble>0?0f:-Ui.dp(getContext(),5);}progressHead.animate().x(x).translationY(y).rotation(rotation).setDuration(320).start();});}

    private static State readState(Context context){
        try{
            List<WorkInfo> infos=WorkManager.getInstance(context.getApplicationContext()).getWorkInfosForUniqueWork(NativeRecommendationJobs.UNIQUE_NAME).get();
            if(infos==null||infos.isEmpty())return null;WorkInfo chosen=null;for(WorkInfo info:infos)if(!info.getState().isFinished())chosen=info;if(chosen==null)chosen=infos.get(infos.size()-1);
            WorkInfo.State ws=chosen.getState();Data data=ws.isFinished()?chosen.getOutputData():chosen.getProgress();String text=data.getString(NativeRecommendationWorker.KEY_PHASE);int done=data.getInt(NativeRecommendationWorker.KEY_DONE,0),total=data.getInt(NativeRecommendationWorker.KEY_TOTAL,0);
            if(ws==WorkInfo.State.RUNNING)return new State(true,false,false,text==null||text.isEmpty()?"正在生成推荐…":text,progressDetail(done,total),done,total);
            if(ws==WorkInfo.State.ENQUEUED)return new State(true,false,false,"等待开始生成…","正在等待网络或系统调度。",0,0);
            if(ws==WorkInfo.State.BLOCKED)return new State(true,false,false,"等待任务条件…","满足运行条件后会自动继续。",0,0);
            if(ws==WorkInfo.State.FAILED)return new State(false,true,false,"",text==null?"":text,done,total);
            if(ws==WorkInfo.State.SUCCEEDED)return new State(false,false,true,"",text==null?"":text,done,total);
            return new State(false,false,false,"","",0,0);
        }catch(Exception e){return null;}
    }

    private static String progressDetail(int done,int total){if(total<=0)return "正在处理…";int percent=(int)Math.round(done*100d/Math.max(1,total));return done+" / "+total+" · "+Math.max(0,Math.min(100,percent))+"%";}
    private static final class State{final boolean active,failed,succeeded;final String phase,detail;final int done,total;State(boolean active,boolean failed,boolean succeeded,String phase,String detail,int done,int total){this.active=active;this.failed=failed;this.succeeded=succeeded;this.phase=phase;this.detail=detail;this.done=done;this.total=total;}}
}