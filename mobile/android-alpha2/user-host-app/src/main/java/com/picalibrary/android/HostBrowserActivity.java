package com.picalibrary.android;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.graphics.Color;
import android.os.Bundle;
import android.text.InputType;
import android.view.View;
import android.widget.*;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Explicit user-owned Host control over the EXISTING source-neutral
 * HostSourceManager. Neither this UI nor entering it installs, selects or
 * connects a source. No new GraphQL client, Reader, cache or manga database.
 */
public final class HostBrowserActivity extends Activity {
    private final ExecutorService executor=Executors.newSingleThreadExecutor();
    private final List<HostProtocol.Source> sources=new ArrayList<>();
    private HostSourceManager manager;
    private EditText label,endpoint,username,password,query;
    private CheckBox allowLan,permission,basicAuth;
    private Spinner sourceChoices;
    private LinearLayout results;
    private TextView status;
    private Button save,enable,start,disconnect,refresh,select,search;
    private boolean busy,destroyed;
    private int generation;

    private String t(String zh,String en,String ja){return LocalCopy.ui(this,zh,en,ja);}
    private int dp(int n){return Math.round(n*getResources().getDisplayMetrics().density);}
    private TextView text(String s,int size){
        TextView v=new TextView(this);v.setText(s);v.setTextSize(size);
        v.setTextColor(Color.WHITE);v.setPadding(0,dp(5),0,dp(5));return v;
    }
    private Button action(LinearLayout root,String title){
        Button b=new Button(this);b.setText(title);b.setAllCaps(false);
        root.addView(b,new LinearLayout.LayoutParams(-1,dp(48)));return b;
    }
    private EditText field(LinearLayout root,String hint,boolean secret){
        EditText e=new EditText(this);e.setSingleLine(true);e.setHint(hint);
        e.setContentDescription(hint);
        if(secret)e.setInputType(InputType.TYPE_CLASS_TEXT|
                InputType.TYPE_TEXT_VARIATION_PASSWORD);
        root.addView(e,new LinearLayout.LayoutParams(-1,dp(48)));return e;
    }
    private interface Task {Runnable execute()throws Exception;}
    private void task(String message,Task action){
        if(busy||destroyed)return;
        busy=true;status.setText(message);controls();
        final int ticket=++generation;
        executor.submit(()->{
            Runnable complete=null;Exception failure=null;
            try{complete=action.execute();}catch(Exception e){failure=e;}
            final Runnable completed=complete;
            final Exception error=failure;
            runOnUiThread(()->{
                if(destroyed||ticket!=generation)return;
                busy=false;
                if(error==null&&completed!=null)completed.run();
                else status.setText(t("操作失败：检查 Host 地址、会话或授权。",
                    "Operation failed. Check Host, session and permissions.",
                    "操作に失敗しました。Host と接続を確認してください。"));
                controls();
            });
        });
    }
    private void controls(){
        if(manager==null||save==null)return;
        boolean session=manager.hasSession();
        save.setEnabled(!busy);
        enable.setEnabled(!busy&&manager.config().configured());
        start.setEnabled(!busy&&manager.config().enabled&&!session);
        disconnect.setEnabled(!busy&&session);
        refresh.setEnabled(!busy&&session&&manager.selectedSource().isEmpty());
        select.setEnabled(!busy&&session&&manager.selectedSource().isEmpty()&&!sources.isEmpty());
        search.setEnabled(!busy&&session&&!manager.selectedSource().isEmpty());
    }

    @Override public void onCreate(Bundle saved){
        super.onCreate(saved);manager=HostSourceManager.get(this);
        LinearLayout root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.rgb(20,20,26));
        root.setPadding(dp(16),dp(18),dp(16),dp(26));
        root.addView(text(t("我的外部来源","My external sources","外部ソース"),23));
        root.addView(text(t(
            "仅连接你自行运行的 Suwayomi 2.4 Host。配置不会自动联网或安装任何漫画源；本地书库不受影响。",
            "Connect only a Suwayomi 2.4 Host you manage. No automatic connection or source installation. Local reading works offline.",
            "自分で管理する Suwayomi 2.4 Host のみ。自動接続や拡張導入なし。ローカル書庫はオフライン。"),12));
        // Keep the status at the top of a long scrollable form. Previously it
        // appeared below the results and could not be seen after an action.
        status=text("",13);status.setTag("host.qa.status");
        status.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
        root.addView(status);
        Button back=action(root,t("返回书库","Back to library","書庫に戻る"));
        back.setOnClickListener(v->finish());
        label=field(root,t("连接名称","Host name","接続名"),false);
        endpoint=field(root,t("Host URL (http:// 或 https://)","Host URL","Host URL"),false);
        allowLan=new CheckBox(this);
        allowLan.setText(t("本次允许我明确输入的局域网地址使用 HTTP",
            "Allow HTTP for this explicitly entered private LAN IP",
            "指定した LAN IP で HTTP を許可"));
        allowLan.setTextColor(Color.WHITE);root.addView(allowLan);
        save=action(root,t("保存配置","Save configuration","設定を保存"));
        enable=action(root,t("启用 / 停用 Host","Enable / disable Host","Host 有効／無効"));
        basicAuth=new CheckBox(this);
        basicAuth.setText(t("此 Host 使用 Basic 认证",
            "This Host uses Basic authentication","Basic 認証を使用"));
        basicAuth.setTextColor(Color.WHITE);root.addView(basicAuth);
        username=field(root,t("Basic 用户名（如有）","Basic username (if needed)","ユーザー名"),false);
        password=field(root,t("Basic 密码（如有）","Basic password (if needed)","パスワード"),true);
        username.setSaveEnabled(false);password.setSaveEnabled(false);
        username.setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_NO);
        password.setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_NO);
        permission=new CheckBox(this);
        permission.setText(t("我授权本次连接自己的 Host","Authorize this Host session",
            "この接続を許可します"));
        permission.setTextColor(Color.WHITE);root.addView(permission);
        start=action(root,t("连接并读取来源","Connect and list sources","接続してソースを表示"));
        disconnect=action(root,t("断开会话","Disconnect","セッション終了"));
        refresh=action(root,t("刷新来源","Refresh sources","ソース更新"));
        sourceChoices=new Spinner(this);root.addView(sourceChoices);
        select=action(root,t("选择此来源","Use selected source","ソースを選択"));
        query=field(root,t("搜索作品","Search works","作品を検索"),false);
        search=action(root,t("搜索选中来源","Search selected source","選択ソースで検索"));
        results=new LinearLayout(this);results.setOrientation(LinearLayout.VERTICAL);
        root.addView(results);
        ScrollView scroller=new ScrollView(this);scroller.addView(root);
        setContentView(scroller);

        save.setOnClickListener(v->{
            String name=label.getText().toString().trim();
            String url=endpoint.getText().toString().trim();
            boolean allow=allowLan.isChecked();
            // Auth mode is a saved descriptor, never persistent credentials.
            String mode=basicAuth.isChecked()?"basic":"none";
            long revision=manager.config().revision;
            task(t("保存中…","Saving…","保存中…"),()->{
                manager.configure(revision,name,url,mode,allow);
                return ()->{sources.clear();results.removeAllViews();
                    status.setText(t("已保存；没有自动连接","Saved; no connection started",
                        "保存しました。未接続です。"));};
            });
        });
        enable.setOnClickListener(v->{
            if(!permission.isChecked()){
                status.setText(t("请先勾选授权","Authorize this action first",
                    "許可が必要です"));return;
            }
            HostConfigStore.Config config=manager.config();
            task(t("更新中…","Updating…","設定更新中…"),()->{
                manager.enabled(config.revision,!config.enabled,true);
                return ()->status.setText(manager.config().enabled?
                    t("已启用，仍未连接","Enabled; not connected","有効・未接続"):
                    t("已停用","Disabled","無効"));
            });
        });
        start.setOnClickListener(v->{
            if(!permission.isChecked()){
                status.setText(t("请先允许本次连接","Authorize this connection",
                    "接続許可が必要です"));return;
            }
            String user=username.getText().toString(),secret=password.getText().toString();
            username.setText("");password.setText("");
            task(t("正在连接 Host…","Connecting…","接続中…"),()->{
                manager.start(user,secret,true);
                HostProtocol.Sources available=manager.sources(0);
                return ()->{showSources(available);
                    status.setText(t("请选择来源","Select a source","ソースを選択"));};
            });
        });
        disconnect.setOnClickListener(v->{
            manager.end();sources.clear();results.removeAllViews();
            permission.setChecked(false);
            status.setText(t("已断开","Disconnected","切断しました"));controls();
        });
        refresh.setOnClickListener(v->task(t("读取来源…","Loading sources…","取得中…"),()->{
            HostProtocol.Sources available=manager.sources(0);
            return ()->showSources(available);
        }));
        select.setOnClickListener(v->{
            int chosen=sourceChoices.getSelectedItemPosition();
            if(chosen<0||chosen>=sources.size())return;
            String id=sources.get(chosen).id;
            task(t("正在绑定来源…","Selecting source…","ソース選択中…"),()->{
                manager.bind(id,true);
                return ()->status.setText(t("来源已就绪，可搜索","Source ready to search",
                    "検索できます"));
            });
        });
        search.setOnClickListener(v->{
            String needle=query.getText().toString().trim();
            if(needle.isEmpty())return;
            task(t("搜索中…","Searching…","検索中…"),()->{
                HostSourceManager.SearchResult found=manager.search(needle,1);
                return ()->showResults(found.books);
            });
        });
        HostConfigStore.Config config=manager.config();
        label.setText(config.label);endpoint.setText(config.endpoint);
        allowLan.setChecked(config.allowLan);
        basicAuth.setChecked("basic".equals(config.authMode));
        status.setText(manager.hasSession()?t("会话已连接","Host session connected","接続済み"):
            t("尚未连接 Host","No Host connected","未接続"));
        controls();
    }

    private void showSources(HostProtocol.Sources page){
        sources.clear();sources.addAll(page.rows);
        List<String> labels=new ArrayList<>();
        for(HostProtocol.Source item:sources)labels.add(item.name+" · "+item.language);
        sourceChoices.setAdapter(new ArrayAdapter<>(this,
            android.R.layout.simple_spinner_dropdown_item,labels));
        controls();
    }

    private void showResults(List<HostSourceManager.Book> books){
        results.removeAllViews();
        if(books.isEmpty()){results.addView(text(t("没有匹配作品","No matches",
            "一致する作品なし"),14));return;}
        for(HostSourceManager.Book book:books){
            results.addView(text(book.title,17));
            Button read=action(results,t("阅读","Read","読む")+" · "+book.title);
            read.setOnClickListener(v->task(t("准备章节…","Preparing reader…","閲覧準備中…"),()->{
                manager.select(book.id);
                return ()->startActivity(new Intent(this,HostReaderActivity.class)
                    .putExtra("source","host").putExtra("comicId",book.id)
                    .putExtra("title",book.title));
            }));
            Button saveChapter=action(results,t("保存本地副本","Save chapter offline",
                "章をローカル保存"));
            saveChapter.setOnClickListener(v->chooseChapter(book));
        }
    }

    private void chooseChapter(HostSourceManager.Book book){
        task(t("读取章节…","Loading chapters…","章を取得中…"),()->{
            HostSourceManager.Session grant=manager.requireSession();
            manager.select(book.id);
            List<ReaderContent.Chapter> chapters=manager.chapters(grant,book.id);
            return ()->{
                if(chapters.isEmpty()){
                    status.setText(t("没有章节","No chapters","章がありません"));return;
                }
                String[] names=new String[chapters.size()];
                for(int i=0;i<chapters.size();i++)names[i]=chapters.get(i).title;
                new AlertDialog.Builder(this)
                    .setTitle(t("选择要保存的章节","Select chapter","章を選択"))
                    .setItems(names,(dialog,index)->
                        confirmSave(grant,book,chapters.get(index)))
                    .setNegativeButton(android.R.string.cancel,null).show();
            };
        });
    }

    private void confirmSave(HostSourceManager.Session grant,
            HostSourceManager.Book book,ReaderContent.Chapter chapter){
        new AlertDialog.Builder(this)
            .setTitle(t("保存本地副本？","Save a local copy?","ローカル保存しますか"))
            .setMessage(t("仅保存你获授权使用的这一章。完成后离线可读，"+
                "不会修改原 Host 收藏。",
                "Copy only this authorized chapter. It stays readable offline; "+
                "Host favorites are unchanged.",
                "許可された章だけ保存します。Host のお気に入りは変更しません。"))
            .setNegativeButton(android.R.string.cancel,null)
            .setPositiveButton(t("确认保存","Save","保存"),(dialog,which)->
                task(t("保存中…","Saving…","保存中…"),()->{
                    LocalComicStore.Comic result=HostOfflineSaver.save(this,
                        manager,grant,book.id,chapter.id,true,(done,total)->
                            runOnUiThread(()->{
                                if(!destroyed)status.setText(done+" / "+total);
                            }));
                    return ()->status.setText(t("已保存本地：","Saved locally: ",
                        "ローカル保存：")+result.title);
                }))
            .show();
    }
    @Override protected void onResume(){
        super.onResume();
        if(manager!=null)controls();
    }
    @Override protected void onDestroy(){
        destroyed=true;executor.shutdownNow();super.onDestroy();
    }
}
