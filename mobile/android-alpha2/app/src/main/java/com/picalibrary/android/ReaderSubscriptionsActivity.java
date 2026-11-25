package com.picalibrary.android;

import android.app.*;
import android.content.Intent;
import android.os.Bundle;
import android.view.*;
import androidx.recyclerview.widget.*;
import android.widget.*;
import java.util.*;
import java.util.concurrent.*;

public final class ReaderSubscriptionsActivity extends LocaleAwareActivity {
    private static final ExecutorService io=Executors.newSingleThreadExecutor();
    private int generation;private boolean partial;
    private LinearLayout tabs; private TextView status,empty;
    private RecyclerView books; private UnifiedComicCollectionAdapter cards; private Button refresh;
    private String selected=""; private Map<String,String> authors=Collections.emptyMap();
    private List<ReaderRoundLedger.Entry> inbox=Collections.emptyList();
    private final LinkedHashMap<String,Group> groups=new LinkedHashMap<>();
    private UnifiedCatalogStore.Snapshot catalog;
    static final class Group {
        final TreeMap<Integer,ReaderRoundLedger.Entry> chapters=new TreeMap<>();
        final Set<String> writers=new LinkedHashSet<>();
        void add(ReaderRoundLedger.Entry e){chapters.putIfAbsent(e.chapter,e);writers.add(e.author);}
        ReaderRoundLedger.Entry first(){return chapters.firstEntry().getValue();}
    }
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
    @Override public void onCreate(Bundle saved){
        super.onCreate(saved);Ui.applyWindow(this);
        if(saved!=null)selected=saved.getString("author","");
        LinearLayout layout=new LinearLayout(this);layout.setOrientation(LinearLayout.VERTICAL);layout.setFitsSystemWindows(true);
        layout.setPadding(dp(12),dp(6),dp(12),0);layout.setBackgroundColor(Ui.BG);
        LinearLayout bar=new LinearLayout(this);bar.setGravity(Gravity.CENTER_VERTICAL);layout.addView(bar);
        Button back=Ui.button(this,"‹",v->finish(),true);back.setContentDescription(t("返回","Back","戻る"));back.setPadding(0,0,0,0);bar.addView(back,new LinearLayout.LayoutParams(dp(48),dp(48)));
        TextView title=Ui.text(this,t("订阅更新","Updates","購読の新着"),21,Ui.TEXT,true);bar.addView(title,new LinearLayout.LayoutParams(0,-2,1));
        refresh=Ui.button(this,t("刷新","Refresh","更新"),v->scan(true),true);bar.addView(refresh);
        bar.addView(Ui.button(this,t("管理","Manage","管理"),v->manage(),true));
        HorizontalScrollView scroller=new HorizontalScrollView(this);scroller.setHorizontalScrollBarEnabled(false);
        tabs=new LinearLayout(this);scroller.addView(tabs);layout.addView(scroller);
        status=Ui.text(this,"",12,Ui.MUTED,false);status.setPadding(dp(4),dp(6),0,dp(3));layout.addView(status);
        empty=Ui.text(this,"",15,Ui.MUTED,false);empty.setGravity(Gravity.CENTER);empty.setPadding(dp(8),dp(45),dp(8),0);layout.addView(empty);
        books=new RecyclerView(this);books.setItemAnimator(null);books.setClipToPadding(false);
        int mode=UnifiedComicCollectionAdapter.normalizeMode(getSharedPreferences("alpha81-ui",MODE_PRIVATE).getInt("collectionMode",UnifiedComicCollectionAdapter.MODE_GRID_MEDIUM));
        books.setLayoutManager(mode==0?new LinearLayoutManager(this):new GridLayoutManager(this,mode));
        cards=new UnifiedComicCollectionAdapter(this,mode,Collections.emptyList(),b->open(b.id,true));cards.setCardOverlay(this::bindCard);
        books.setAdapter(cards);layout.addView(books,new LinearLayout.LayoutParams(-1,0,1));setContentView(layout);
    }
    private int dp(int n){return Ui.dp(this,n);}
    @Override protected void onSaveInstanceState(Bundle out){super.onSaveInstanceState(out);out.putString("author",selected);}
    @Override public void onResume(){super.onResume();reload();scan(false);}
    private void scan(boolean force){
        refresh.setEnabled(false);
        ReaderSubscriptionSync.refresh(this,force,(n,p)->{if(isDestroyed()||isFinishing())return;partial=p;refresh.setEnabled(true);reload();});
    }
    private void reload(){
        int tag=++generation;io.execute(()->{
            ReaderRoundLedger db=ReaderRoundLedger.get(this);List<ReaderRoundLedger.Entry> rows=db.inbox();Map<String,String> names=db.following();UnifiedCatalogStore.Snapshot snapshot=UnifiedCatalogStore.load(this);
            runOnUiThread(()->{if(tag!=generation||isDestroyed()||isFinishing())return;
                inbox=rows;authors=names;catalog=snapshot;if(!selected.isEmpty()&&!authors.containsKey(selected))selected="";render(false);
            });
        });
    }
    private void tab(String key,String text){
        final boolean active=selected.equals(key);Button b=Ui.button(this,text,v->{if(!selected.equals(key)){selected=key;render(true);}},true);
        b.setSelected(active);if(active)b.setBackground(Ui.rounded(Ui.PRIMARY_SOFT,12,this));b.setSingleLine(true);
        LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(-2,-2);lp.setMargins(0,dp(3),dp(5),0);tabs.addView(b,lp);
    }
    private void render(boolean newFilter){
        // Work IDs are kept intact. Multiple chapter alerts on one work occupy one card.
        groups.clear();LinkedHashSet<String> activeAuthors=new LinkedHashSet<>();
        for(ReaderRoundLedger.Entry e:inbox){
            activeAuthors.add(e.author);
            if(selected.isEmpty()||selected.equals(e.author))groups.computeIfAbsent(e.id,k->new Group()).add(e);
        }
        tabs.removeAllViews();tab("",t("全部更新","All updates","すべて"));if(!selected.isEmpty())activeAuthors.add(selected);
        for(String key:activeAuthors)tab(key,authors.getOrDefault(key,key));
        List<UnifiedCatalogStore.Entry> visible=new ArrayList<>();int alerts=0;
        for(Group g:groups.values()){
            ReaderRoundLedger.Entry e=g.first();UnifiedCatalogStore.Entry b=catalog.byId.get(e.id);
            if(b==null)b=new UnifiedCatalogStore.Entry(e.id,e.title,authors.getOrDefault(e.author,e.author));
            visible.add(b);alerts+=g.chapters.size();
        }
        int count=visible.size();status.setText(t(count+" 本 · "+alerts+" 条待看",count+" works · "+alerts+" unread",count+" 作品 · 未読 "+alerts)+(partial?t(" · 部分来源待检查"," · Some sources unchecked"," · 一部未確認"):""));
        empty.setText(t(selected.isEmpty()?"暂无待看更新":"这位作者暂无待看更新","No unread updates","未読の更新はありません"));empty.setVisibility(count==0?View.VISIBLE:View.GONE);
        cards.replace(visible);if(newFilter && count!=0)books.scrollToPosition(0);
    }
    private void bindCard(UnifiedComicCollectionAdapter.Holder h,UnifiedCatalogStore.Entry b){
        Group g=groups.get(b.id);if(g==null)return;ReaderRoundLedger.Entry e=g.first();int n=g.chapters.size();
        h.author.setText(authors.getOrDefault(e.author,b.displayAuthor()));h.tags.setVisibility(View.GONE);
        String first=e.chapter==0?t("新作","New work","新作"):t("第 "+e.chapter+" 章","Ch. "+e.chapter,"第 "+e.chapter+" 話");
        h.state.setText(t(n+" 条待看",n+" unread","未読 "+n)+" · ▶ "+first);h.state.setTextColor(Ui.PRIMARY);h.state.setMaxLines(2);h.state.setVisibility(View.VISIBLE);
        h.play.setText("⋯");h.play.setVisibility(View.VISIBLE);h.play.setContentDescription(t("更新操作","Update options","操作")+" · "+b.title);h.play.setOnClickListener(v->options(e));
        h.itemView.setOnLongClickListener(v->{options(e);return true;});
    }
    private void open(String id,boolean read){
        Group g=groups.get(id);if(g==null)return;ReaderRoundLedger.Entry e=g.first();
        Intent i=new Intent(this,UnifiedComicDetailActivity.class);i.putExtra("comicId",id);i.putExtra("title",e.title);i.putExtra("author",authors.get(e.author));if(read)i.putExtra("alertChapter",e.chapter);startActivity(i);
    }
    private void options(ReaderRoundLedger.Entry e){
        String mark=e.chapter==0?t("标记这条新作提醒为已看","Mark new-work alert as seen","新作通知を既読にする"):t("标记第 "+e.chapter+" 章为已看","Mark chapter "+e.chapter+" as seen","第 "+e.chapter+" 話を既読にする");
        new AlertDialog.Builder(this).setTitle(e.title).setItems(new String[]{t("作品详情","Work details","作品の詳細"),mark},(d,w)->{
            if(w==0){open(e.id,false);return;}
            List<ReaderRoundLedger.Entry> exact=new ArrayList<>();for(ReaderRoundLedger.Entry v:inbox)if(v.id.equals(e.id)&&v.chapter==e.chapter)exact.add(v);
            io.execute(()->{ReaderRoundLedger db=ReaderRoundLedger.get(this);for(ReaderRoundLedger.Entry row:exact)db.dismiss(row);runOnUiThread(this::reload);});
        }).show();
    }
    private void manage(){
        List<String> keys=new ArrayList<>(authors.keySet());keys.sort(Comparator.comparing(k->authors.get(k)));
        AlertDialog.Builder dialog=new AlertDialog.Builder(this).setTitle(t("管理订阅作者","Manage authors","購読の管理")).setNegativeButton(android.R.string.cancel,null);
        if(keys.isEmpty())dialog.setMessage(t("还没有订阅作者","No subscriptions yet","購読中の作者はいません"));
        else {String[] labels=new String[keys.size()];for(int i=0;i<keys.size();i++)labels[i]=authors.get(keys.get(i));
            dialog.setItems(labels,(d,w)->{String key=keys.get(w);new AlertDialog.Builder(this).setTitle(labels[w])
                .setMessage(t("取消订阅并移除此作者的提醒？不会删除收藏或阅读记录。","Unsubscribe and remove this author’s alerts? Favorites and history stay unchanged.","購読と通知を解除しますか？お気に入りや履歴は変わりません。"))
                .setNegativeButton(android.R.string.cancel,null).setPositiveButton(t("取消订阅","Unsubscribe","購読解除"),(dd,k)->io.execute(()->{ReaderRoundLedger.get(this).unfollow(key);runOnUiThread(this::reload);})).show();});}
        dialog.show();
    }
}
