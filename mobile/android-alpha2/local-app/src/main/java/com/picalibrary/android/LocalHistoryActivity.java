package com.picalibrary.android;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.HorizontalScrollView;
import android.widget.LinearLayout;
import android.widget.ListView;
import android.widget.TextView;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Read-only local QA history UI. All session data, dates and bookmark selection
 * use the exact original ReaderHistoryLedger; no second history store.
 */
public final class LocalHistoryActivity extends Activity {
    private final ExecutorService worker=Executors.newSingleThreadExecutor();
    private final ArrayList<ReaderHistoryLedger.Session> sessions=new ArrayList<>();
    private ReaderHistoryLedger.Range range=ReaderHistoryLedger.Range.DAYS_30;
    private ArrayAdapter<ReaderHistoryLedger.Session> adapter;
    private LinearLayout filters;
    private TextView status;
    private boolean destroyed;

    private int dp(int size){return Math.round(size*getResources().getDisplayMetrics().density);}
    private String copy(String zh,String en,String ja){return LocalCopy.ui(this,zh,en,ja);}
    private TextView label(String text,int size){
        TextView view=new TextView(this);
        view.setText(text);
        view.setTextSize(size);
        view.setTextColor(Color.WHITE);
        return view;
    }
    private Button button(String text){
        Button view=new Button(this);
        view.setText(text);
        view.setAllCaps(false);
        return view;
    }

    @Override public void onCreate(Bundle state){
        super.onCreate(state);
        LinearLayout root=new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.rgb(20,20,26));
        root.setPadding(dp(12),dp(12),dp(12),dp(12));
        root.setOnApplyWindowInsetsListener((v,insets)->{
            v.setPadding(dp(12),dp(12)+insets.getSystemWindowInsetTop(),
                         dp(12),dp(12)+insets.getSystemWindowInsetBottom());
            return insets;
        });

        LinearLayout titleRow=new LinearLayout(this);
        titleRow.setGravity(Gravity.CENTER_VERTICAL);
        Button back=button(copy("返回","Back","戻る"));
        back.setOnClickListener(v->finish());
        titleRow.addView(back,new LinearLayout.LayoutParams(dp(88),dp(48)));
        titleRow.addView(label(copy("阅读历史","Reading history","閲覧履歴"),20));
        root.addView(titleRow);

        HorizontalScrollView scroll=new HorizontalScrollView(this);
        scroll.setHorizontalScrollBarEnabled(false);
        filters=new LinearLayout(this);
        filters.setOrientation(LinearLayout.HORIZONTAL);
        scroll.addView(filters);
        root.addView(scroll);
        renderFilters();

        status=label(copy("正在读取历史…","Loading history…","履歴を読み込み中…"),13);
        status.setPadding(dp(8),dp(8),dp(8),dp(8));
        root.addView(status);

        ListView list=new ListView(this);
        adapter=new ArrayAdapter<ReaderHistoryLedger.Session>(
                this,android.R.layout.simple_list_item_1,sessions){
            @Override public View getView(int position,View convertView,ViewGroup parent){
                TextView row=convertView instanceof TextView?(TextView)convertView:label("",15);
                ReaderHistoryLedger.Session session=getItem(position);
                if(session!=null){
                    String chapter=session.chapterTitle==null||session.chapterTitle.isEmpty()
                            ?copy("章节","Chapter","チャプター"):session.chapterTitle;
                    String day=ReaderHistoryLedger.localDay(session.lastReadAt)==null?""
                            :ReaderHistoryLedger.localDay(session.lastReadAt).toString()+" ";
                    String time=ReaderHistoryLedger.timeLabel(session.lastReadAt,ZoneId.systemDefault());
                    row.setText(session.title+"\n"+chapter+" · "+
                        copy("第 ","Page ","")+(session.lastPage+1)+copy(" 页","", " ページ")+
                        "\n"+day+time);
                }
                row.setPadding(dp(12),dp(12),dp(12),dp(12));
                row.setMinHeight(dp(76));
                return row;
            }
        };
        list.setAdapter(adapter);
        list.setOnItemClickListener((parent,view,position,id)->{
            if(position<0||position>=sessions.size())return;
            ReaderHistoryLedger.Session selected=sessions.get(position);
            if(selected.chapterId.isEmpty()||!LocalComicStore.has(this,selected.comicId)){
                status.setText(copy("本地副本已不存在，无法继续阅读",
                        "Local copy no longer exists; cannot resume",
                        "ローカルコピーがないため再開できません"));
                return;
            }
            ReaderProgressLedger.seedOneShotPosition(this,selected.comicId,
                                                       selected.chapterId,selected.lastPage);
            Intent open=new Intent(this,LocalReaderActivity.class);
            open.putExtra("source","local");
            open.putExtra("comicId",selected.comicId);
            open.putExtra("title",selected.title);
            open.putExtra("episodeId",selected.chapterId);
            startActivity(open);
        });
        root.addView(list,new LinearLayout.LayoutParams(-1,0,1));
        setContentView(root);
    }

    private void renderFilters(){
        if(filters==null)return;
        filters.removeAllViews();
        filter(copy("今天","Today","今日"),ReaderHistoryLedger.Range.TODAY);
        filter(copy("7天","7 days","7日"),ReaderHistoryLedger.Range.DAYS_7);
        filter(copy("30天","30 days","30日"),ReaderHistoryLedger.Range.DAYS_30);
        filter(copy("全部","All","すべて"),ReaderHistoryLedger.Range.ALL);
    }
    private void filter(String title,ReaderHistoryLedger.Range value){
        Button button=button(title+(range==value?" ✓":""));
        button.setOnClickListener(v->{range=value;renderFilters();refresh();});
        filters.addView(button,new LinearLayout.LayoutParams(-2,dp(48)));
    }
    @Override protected void onResume(){super.onResume();if(adapter!=null)refresh();}
    private void refresh(){
        ReaderHistoryLedger.Range selected=range;
        status.setText(copy("正在读取历史…","Loading history…","履歴を読み込み中…"));
        worker.execute(()->{
            ReaderHistoryLedger.Snapshot snapshot=
                    ReaderHistoryLedger.load(ReaderHistoryLedger.localFile(getApplicationContext()));
            List<ReaderHistoryLedger.Session> found=
                    ReaderHistoryLedger.filter(snapshot,selected,null,ZoneId.systemDefault());
            found.removeIf(row->!"local".equals(row.sourceKind));
            runOnUiThread(()->{
                if(destroyed||range!=selected)return;
                sessions.clear();
                sessions.addAll(found);
                adapter.notifyDataSetChanged();
                status.setText(found.isEmpty()
                    ?copy("此时间段还没有本地阅读记录","No local reading history in this period",
                          "この期間のローカル閲覧履歴はありません")
                    :copy("会话记录：","Sessions: ","履歴：")+found.size());
            });
        });
    }
    @Override protected void onDestroy(){
        destroyed=true;
        worker.shutdownNow();
        super.onDestroy();
    }
}
