package com.picalibrary.android;

import android.app.Activity;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.widget.*;
import androidx.work.WorkInfo;
import androidx.work.WorkManager;
import java.util.*;
import java.util.concurrent.*;

/** One task surface for lifecycle-independent import, download, Pica bootstrap and recommendation jobs. */
public final class TaskCenterActivity extends LocaleAwareActivity {
    private final ExecutorService worker=Executors.newSingleThreadExecutor();private final Handler main=new Handler(Looper.getMainLooper());private LinearLayout content;private boolean destroyed;
    private final Runnable poll=new Runnable(){public void run(){refresh();if(!destroyed)main.postDelayed(this,1200);}};
    @Override public void onCreate(Bundle saved){super.onCreate(saved);Ui.applyWindow(this);render();main.post(poll);}
    private Button button(String label,android.view.View.OnClickListener action){return Ui.button(this,label,action,false);}
    private LinearLayout actions(Button...buttons){LinearLayout row=new LinearLayout(this);row.setOrientation(LinearLayout.HORIZONTAL);row.setGravity(Gravity.CENTER_VERTICAL);for(Button button:buttons){LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(-2,-2);p.setMargins(0,Ui.dp(this,8),Ui.dp(this,8),0);row.addView(button,p);}return row;}
    private void render(){LinearLayout root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);root.setBackgroundColor(Ui.BG);root.setOnApplyWindowInsetsListener((v,i)->{v.setPadding(0,i.getSystemWindowInsetTop(),0,i.getSystemWindowInsetBottom());return i;});LinearLayout bar=new LinearLayout(this);bar.setGravity(Gravity.CENTER_VERTICAL);bar.addView(Ui.button(this,"‹ 返回",v->finish(),true));bar.addView(Ui.text(this,"后台任务",22,Ui.TEXT,true),new LinearLayout.LayoutParams(0,-2,1));root.addView(bar);ScrollView scroll=new ScrollView(this);scroll.setBackgroundColor(Ui.BG);content=new LinearLayout(this);content.setOrientation(LinearLayout.VERTICAL);content.setPadding(Ui.dp(this,12),Ui.dp(this,8),Ui.dp(this,12),Ui.dp(this,24));scroll.addView(content);root.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));setContentView(root);root.requestApplyInsets();}
    private void refresh(){worker.submit(()->{try{WorkManager manager=WorkManager.getInstance(this);List<WorkInfo> downloads=manager.getWorkInfosByTag("pica-download").get(5,TimeUnit.SECONDS);List<WorkInfo> favorites=manager.getWorkInfosForUniqueWork(FavoriteImportJobs.UNIQUE_NAME).get(5,TimeUnit.SECONDS);List<WorkInfo> bootstrap=manager.getWorkInfosForUniqueWork(PicaBootstrapJobs.UNIQUE_NAME).get(5,TimeUnit.SECONDS);List<WorkInfo> recommendation=manager.getWorkInfosForUniqueWork(NativeRecommendationJobs.UNIQUE_NAME).get(5,TimeUnit.SECONDS);runOnUiThread(()->show(downloads,favorites,bootstrap,recommendation));}catch(Exception ignored){}});}
    private void show(List<WorkInfo> downloads,List<WorkInfo> favorites,List<WorkInfo> bootstrap,List<WorkInfo> recommendation){
        if(destroyed)return;
        content.removeAllViews();

        WorkInfo picaSync=latest(bootstrap);
        LinearLayout picaCard=Ui.card(this);
        picaCard.addView(Ui.text(this,"Pica 收藏同步",18,Ui.TEXT,true));
        boolean picaPaused=PicaBootstrapJobs.paused(this);
        if(picaSync==null&&!picaPaused){
            picaCard.addView(Ui.text(this,"暂无同步任务",13,Ui.MUTED,false));
        }else{
            androidx.work.Data d=picaSync==null?androidx.work.Data.EMPTY:(active(picaSync)?picaSync.getProgress():picaSync.getOutputData());
            String phase=d.getString(PicaBootstrapWorker.KEY_PHASE);
            int done=d.getInt(PicaBootstrapWorker.KEY_DONE,0),total=d.getInt(PicaBootstrapWorker.KEY_TOTAL,0);
            picaCard.addView(Ui.text(this,picaPaused?"已暂停":(picaSync==null?"等待继续":status(picaSync))+(phase==null||phase.isEmpty()?"":" · "+phase),13,Ui.MUTED,false));
            if(total>0)picaCard.addView(Ui.text(this,done+" / "+total,12,Ui.PRIMARY,false));
            if(picaPaused){
                picaCard.addView(Ui.text(this,"继续后会从头重新读取远端收藏页；已保存的本地缓存保持可用。",12,Ui.MUTED,false));
                picaCard.addView(actions(button("继续",v->PicaBootstrapJobs.resume(this)),button("取消任务",v->PicaBootstrapJobs.cancel(this))));
            }else if(picaSync!=null&&active(picaSync)){
                picaCard.addView(actions(button("暂停",v->PicaBootstrapJobs.pause(this)),button("取消同步",v->PicaBootstrapJobs.cancel(this))));
            }else if(picaSync!=null&&(picaSync.getState()==WorkInfo.State.FAILED||picaSync.getState()==WorkInfo.State.CANCELLED)){
                picaCard.addView(button("重新同步",v->PicaBootstrapJobs.enqueue(this)));
            }
        }
        content.addView(picaCard);

        WorkInfo rec=latest(recommendation);
        LinearLayout recCard=Ui.card(this);
        recCard.addView(Ui.text(this,"推荐更新",18,Ui.TEXT,true));
        boolean recPaused=NativeRecommendationJobs.paused(this),recPauseAck=NativeRecommendationJobs.pauseAcknowledged(this);
        if(rec==null&&!recPaused){
            recCard.addView(Ui.text(this,"暂无推荐任务",13,Ui.MUTED,false));
        }else{
            androidx.work.Data d=rec==null?androidx.work.Data.EMPTY:(active(rec)?rec.getProgress():rec.getOutputData());
            String phase=d.getString(NativeRecommendationWorker.KEY_PHASE);
            int done=d.getInt(NativeRecommendationWorker.KEY_DONE,0),total=d.getInt(NativeRecommendationWorker.KEY_TOTAL,0);
            recCard.addView(Ui.text(this,recPaused?(recPauseAck?"已暂停":"正在暂停…"):(rec==null?"等待继续":status(rec))+(phase==null||phase.isEmpty()?"":" · "+phase),13,Ui.MUTED,false));
            if(total>0)recCard.addView(Ui.text(this,done+" / "+total,12,Ui.PRIMARY,false));
            if(recPaused){
                recCard.addView(Ui.text(this,recPauseAck?"继续会从当前检查点继续本轮生成；上一轮可用推荐不会被覆盖。":"当前有界请求结束后进入暂停；继续不会重新开始本轮。",12,Ui.MUTED,false));
                recCard.addView(actions(button("继续",v->NativeRecommendationJobs.resume(this)),button("取消本轮",v->NativeRecommendationJobs.cancel(this))));
            }else if(rec!=null&&active(rec)){
                recCard.addView(actions(button("暂停",v->NativeRecommendationJobs.pause(this)),button("取消本轮",v->NativeRecommendationJobs.cancel(this))));
            }else if(rec!=null&&(rec.getState()==WorkInfo.State.FAILED||rec.getState()==WorkInfo.State.CANCELLED)){
                recCard.addView(button("重新生成",v->NativeRecommendationJobs.refresh(this)));
            }
        }
        content.addView(recCard);

        WorkInfo favorite=latest(favorites);
        LinearLayout fav=Ui.card(this);
        fav.addView(Ui.text(this,"电脑收藏与封面",18,Ui.TEXT,true));
        boolean favoritePaused=FavoriteImportJobs.paused(this);
        if(favorite==null&&!favoritePaused){
            fav.addView(Ui.text(this,"暂无导入任务",13,Ui.MUTED,false));
        }else{
            if(favorite!=null&&!favoritePaused)fav.addView(Ui.text(this,status(favorite),13,Ui.MUTED,false));
            else fav.addView(Ui.text(this,"已暂停",13,Ui.MUTED,false));
            if(favorite!=null){DataView progress=data(favorite);fav.addView(Ui.text(this,progress.text,12,Ui.PRIMARY,false));}
            if(favoritePaused){
                fav.addView(Ui.text(this,"继续会重新执行未完成同步；已经缓存的元数据和封面会继续复用。",12,Ui.MUTED,false));
                fav.addView(actions(button("继续",v->FavoriteImportJobs.resume(this)),button("取消导入",v->FavoriteImportJobs.cancel(this))));
            }else if(favorite!=null&&active(favorite)){
                fav.addView(actions(button("暂停",v->FavoriteImportJobs.pause(this)),button("取消导入",v->FavoriteImportJobs.cancel(this))));
            }else if(favorite!=null&&(favorite.getState()==WorkInfo.State.FAILED||favorite.getState()==WorkInfo.State.CANCELLED)){
                fav.addView(button("重新导入",v->FavoriteImportJobs.resume(this)));
            }
        }
        content.addView(fav);

        LinearLayout head=new LinearLayout(this);
        head.setGravity(Gravity.CENTER_VERTICAL);
        head.addView(Ui.text(this,"下载任务",18,Ui.TEXT,true),new LinearLayout.LayoutParams(0,-2,1));
        head.addView(Ui.button(this,"已下载",v->startActivity(new android.content.Intent(this,DownloadsActivity.class)),true));
        content.addView(head);
        int shown=0;
        for(WorkInfo info:downloads){
            if(shown>=30)break;
            Set<String> tags=info.getTags();
            String comic=tag(tags,"comic:"),episode=tag(tags,"episode:");
            if(comic.isEmpty())continue;
            String episodeArg="ALL".equals(episode)?"":episode;
            boolean paused=PicaDownloadJobs.paused(this,comic,episodeArg);
            LinearLayout card=Ui.card(this);
            DataView p=data(info);
            card.addView(Ui.text(this,p.title.isEmpty()?"漫画 "+shortId(comic):p.title,16,Ui.TEXT,true));
            card.addView(Ui.text(this,("ALL".equals(episode)?"全部章节":"章节 "+shortId(episode))+" · "+(paused?"已暂停":status(info)),12,Ui.MUTED,false));
            card.addView(Ui.text(this,p.text,12,Ui.PRIMARY,false));
            if(paused){
                card.addView(Ui.text(this,"继续会从已经完成并校验的页面续传。",12,Ui.MUTED,false));
                card.addView(actions(button("继续",v->PicaDownloadJobs.resume(this,comic,episodeArg)),button("取消下载",v->PicaDownloadJobs.cancel(this,comic,episodeArg))));
            }else if(active(info)){
                card.addView(actions(button("暂停",v->PicaDownloadJobs.pause(this,comic,episodeArg)),button("取消",v->PicaDownloadJobs.cancel(this,comic,episodeArg))));
            }else if(info.getState()==WorkInfo.State.FAILED||info.getState()==WorkInfo.State.CANCELLED){
                card.addView(button("重新下载",v->PicaDownloadJobs.enqueue(this,comic,episodeArg)));
            }
            content.addView(card);
            shown++;
        }
        if(shown==0)content.addView(Ui.text(this,"当前没有下载任务。",13,Ui.MUTED,false));
    }
    private static WorkInfo latest(List<WorkInfo> values){return values==null||values.isEmpty()?null:values.get(values.size()-1);}
    private static boolean active(WorkInfo i){return i.getState()==WorkInfo.State.RUNNING||i.getState()==WorkInfo.State.ENQUEUED||i.getState()==WorkInfo.State.BLOCKED;}
    private static String status(WorkInfo i){switch(i.getState()){case RUNNING:return "执行中";case ENQUEUED:return "等待网络 / 排队中";case BLOCKED:return "等待前序任务";case SUCCEEDED:return "已完成";case FAILED:return "失败";case CANCELLED:return "已取消";default:return i.getState().name();}}
    private static String tag(Set<String> tags,String prefix){for(String tag:tags)if(tag.startsWith(prefix))return tag.substring(prefix.length());return "";}
    private static String shortId(String value){return value.length()>12?value.substring(0,12)+"…":value;}
    private static final class DataView{final String title,text;DataView(String title,String text){this.title=title;this.text=text;}}
    private static DataView data(WorkInfo info){androidx.work.Data d=active(info)?info.getProgress():info.getOutputData();String title=d.getString(PicaDownloadWorker.KEY_TITLE);String phase=d.getString(PicaDownloadWorker.KEY_PHASE);if(title==null)title="";if(phase==null)phase="";int ed=d.getInt(PicaDownloadWorker.KEY_EPISODE_DONE,d.getInt(FavoriteImportWorker.KEY_DONE,0)),et=d.getInt(PicaDownloadWorker.KEY_EPISODE_TOTAL,d.getInt(FavoriteImportWorker.KEY_TOTAL,0)),pd=d.getInt(PicaDownloadWorker.KEY_PAGE_DONE,0),pt=d.getInt(PicaDownloadWorker.KEY_PAGE_TOTAL,0);StringBuilder text=new StringBuilder(phase);if(et>0){if(text.length()>0)text.append(" · ");text.append("章节 ").append(Math.min(ed+((pd>0&&ed<et)?1:0),et)).append(" / ").append(et);}if(pt>0){text.append(" · 页面 ").append(pd).append(" / ").append(pt);}return new DataView(title,text.toString());}
    @Override protected void onDestroy(){destroyed=true;main.removeCallbacksAndMessages(null);worker.shutdownNow();super.onDestroy();}
}
