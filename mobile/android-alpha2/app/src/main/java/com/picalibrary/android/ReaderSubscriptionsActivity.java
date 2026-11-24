package com.picalibrary.android;

import android.app.*;
import android.content.Intent;
import android.os.Bundle;
import android.view.ViewGroup;
import android.widget.*;
import java.util.*;
import java.util.concurrent.*;

public final class ReaderSubscriptionsActivity extends LocaleAwareActivity {
    private static final ExecutorService io=Executors.newSingleThreadExecutor();
    private LinearLayout list;private TextView status;private int generation;private boolean partial;
    static void addFollowControl(Activity activity,ViewGroup parent,String label){
        String key=ReaderRoundPlanner.author(label);if(key.isEmpty())return;
        Button button=Ui.button(activity,LocalizedText.ui(activity,"作者订阅","Author updates","作者の購読"),null,true);parent.addView(button);
        bind(activity,button,key,label);
    }
    private static void bind(Activity a,Button button,String key,String label){
        button.setEnabled(false);io.execute(()->{
            ReaderRoundLedger db=ReaderRoundLedger.get(a);boolean active=db.following().containsKey(key);
            a.runOnUiThread(()->{if(a.isDestroyed()||a.isFinishing())return;
                button.setText(active?LocalizedText.ui(a,"已订阅 · 管理","Subscribed · manage","購読中・管理"):LocalizedText.ui(a,"订阅这位作者","Subscribe to this author","この作者を購読"));
                button.setEnabled(true);button.setOnClickListener(v->{
                    if(active){a.startActivity(new Intent(a,ReaderSubscriptionsActivity.class));return;}
                    button.setEnabled(false);io.execute(()->{db.follow(label);ReaderSubscriptionSync.refresh(a,true,null);
                        a.runOnUiThread(()->{if(!a.isDestroyed()&&!a.isFinishing())bind(a,button,key,label);});});
                });
            });
        });
    }
    private String t(String zh,String en,String ja){return LocalizedText.ui(this,zh,en,ja);}
    @Override public void onCreate(Bundle state){
        super.onCreate(state);Ui.applyWindow(this);
        LinearLayout layout=new LinearLayout(this);layout.setOrientation(LinearLayout.VERTICAL);
        layout.setPadding(Ui.dp(this,16),Ui.dp(this,12),Ui.dp(this,16),Ui.dp(this,8));
        layout.setFitsSystemWindows(true);
        layout.addView(Ui.text(this,t("作者订阅","Author updates","作者の新着"),22,Ui.TEXT,true));
        LinearLayout actions=new LinearLayout(this);layout.addView(actions);
        actions.addView(Ui.button(this,t("返回","Back","戻る"),v->finish(),true));
        actions.addView(Ui.button(this,t("检查更新","Check updates","更新を確認"),v->scan(true),true));
        status=Ui.text(this,"",13,Ui.MUTED,false);layout.addView(status);
        ScrollView scroll=new ScrollView(this);list=new LinearLayout(this);list.setOrientation(LinearLayout.VERTICAL);scroll.addView(list);
        layout.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));setContentView(layout);
    }
    @Override public void onResume(){super.onResume();reload();scan(false);}
    private void scan(boolean force){
        status.setText(t("正在检查订阅…","Checking subscriptions…","購読を確認中…"));
        ReaderSubscriptionSync.refresh(this,force,(n,p)->{if(isDestroyed()||isFinishing())return;partial=p;reload();});
    }
    private void reload(){
        final int tag=++generation;io.execute(()->{
            ReaderRoundLedger db=ReaderRoundLedger.get(this);List<ReaderRoundLedger.Entry> inbox=db.inbox();Map<String,String> authors=db.following();
            runOnUiThread(()->{if(tag!=generation||isDestroyed()||isFinishing())return;list.removeAllViews();
                status.setText(t("待看 "+inbox.size()+" 条","Unread: "+inbox.size(),"未読 "+inbox.size()+" 件")+
                    (partial?t(" · 部分来源或旧作尚未查完"," · Some sources or older works are not fully checked","・一部の配信元または旧作は未確認"):""));
                if(inbox.isEmpty())list.addView(Ui.text(this,t("没有待看更新。在作品详情订阅作者，首次不补发旧作。","No unread updates. Subscribe from a work's details; old works are not announced.","未読なし。作品詳細から作者を購読できます。過去作は通知しません。"),14,Ui.TEXT,false));
                for(ReaderRoundLedger.Entry e:inbox){
                    String what=e.chapter==0?t("新作","New work","新作"):t("新增第 "+e.chapter+" 章","New chapter "+e.chapter,"第 "+e.chapter+" 話");
                    list.addView(Ui.text(this,what+" · "+e.title,16,Ui.TEXT,true));LinearLayout actions=new LinearLayout(this);list.addView(actions);
                    actions.addView(Ui.button(this,t("查看作品","View work","作品を見る"),v->{
                        Intent i=new Intent(this,UnifiedComicDetailActivity.class);i.putExtra("comicId",e.id);i.putExtra("title",e.title);i.putExtra("author",authors.get(e.author));startActivity(i);
                    },true));
                    actions.addView(Ui.button(this,t("标为已看","Mark as seen","既読にする"),v->io.execute(()->{db.dismiss(e);runOnUiThread(this::reload);}),true));
                }
                list.addView(Ui.text(this,t("已订阅作者","Subscribed authors","購読中の作者"),18,Ui.TEXT,true));
                for(Map.Entry<String,String> a:authors.entrySet()){
                    list.addView(Ui.button(this,a.getValue()+" · "+t("取消订阅","Unsubscribe","購読解除"),v->
                        new AlertDialog.Builder(this).setMessage(t("取消订阅并移除此作者的提醒？不会删除收藏或阅读记录。","Unsubscribe and remove these alerts? Favorites and reading history stay unchanged.","購読とこの作者の通知を解除しますか？お気に入りと履歴は残ります。"))
                        .setNegativeButton(android.R.string.cancel,null).setPositiveButton(android.R.string.ok,(d,k)->io.execute(()->{db.unfollow(a.getKey());runOnUiThread(this::reload);})).show(),true));
                }
            });
        });
    }
}
