package com.picalibrary.android;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.os.Bundle;
import android.text.InputType;
import android.view.inputmethod.EditorInfo;
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
    private TextView sourcePageStatus;
    private LinearLayout results,setupPanel;
    private Button toggleSetup;
    private ScrollView scroller;
    private TextView status;
    private Button save,enable,start,disconnect,refresh,select,search,previousSources,nextSources;
    private boolean busy,destroyed;
    private int generation,sourceOffset;
    private boolean sourceHasNext;
    // Default stays the physically source-free QA Reader; only an explicitly
    // authorized same-signer full-product QA client can change this destination.
    private String readerPackage="com.picalibrary.android.localcore.qa";
    private boolean trustedReader(){
        if(!"com.picalibrary.android.localcore.qa".equals(readerPackage)&&
                !"com.picalibrary.android.dev".equals(readerPackage)&&
                !"com.picalibrary.android.cleanqa".equals(readerPackage))return false;
        android.content.pm.PackageManager pm=getPackageManager();
        if(pm.checkSignatures(getPackageName(),readerPackage)!=
                android.content.pm.PackageManager.SIGNATURE_MATCH)return false;
        try{
            for(String name:new String[]{"com.picalibrary.android.ExternalReaderActivity",
                    "com.picalibrary.android.ExternalImportActivity"}){
                android.content.pm.ActivityInfo info=pm.getActivityInfo(
                    new android.content.ComponentName(readerPackage,name),0);
                if(!info.exported||
                        !"com.picalibrary.android.remote.BIND_SOURCE".equals(info.permission))
                    return false;
            }
            return true;
        }catch(android.content.pm.PackageManager.NameNotFoundException missing){
            return false;
        }
    }

    private String t(String zh,String en,String ja){return HostCopy.ui(this,zh,en,ja);}
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
        previousSources.setEnabled(!busy&&session&&manager.selectedSource().isEmpty()&&sourceOffset>=25);
        nextSources.setEnabled(!busy&&session&&manager.selectedSource().isEmpty()&&sourceHasNext&&sourceOffset<5000);
    }

    @Override public void onCreate(Bundle saved){
        super.onCreate(saved);
        String requested=getIntent().getStringExtra("pica.reader.package");
        if(requested!=null)readerPackage=requested;
        manager=HostSourceManager.get(this);
        LinearLayout root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.rgb(20,20,26));
        root.setPadding(dp(16),dp(18),dp(16),dp(26));
        // Android 35 edge-to-edge: keep the long Host page clear of status
        // and navigation gesture areas, including after collapsing setup.
        root.setOnApplyWindowInsetsListener((v,insets)->{
            v.setPadding(dp(16),insets.getSystemWindowInsetTop()+dp(12),
                dp(16),insets.getSystemWindowInsetBottom()+dp(16));
            return insets;
        });
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
        Button back=action(root,t("返回阅读器","Back to Reader","Reader に戻る"));
        back.setOnClickListener(v->finish());
        toggleSetup=action(root,t("显示/隐藏 Host 配置","Show / hide Host setup",
            "Host 設定を表示／隠す"));
        setupPanel=new LinearLayout(this);setupPanel.setOrientation(LinearLayout.VERTICAL);
        root.addView(setupPanel);
        toggleSetup.setOnClickListener(v->{
            boolean show=setupPanel.getVisibility()!=View.VISIBLE;
            setupPanel.setVisibility(show?View.VISIBLE:View.GONE);
            if(show)scroller.smoothScrollTo(0,setupPanel.getTop());
        });
        label=field(setupPanel,t("连接名称","Host name","接続名"),false);
        endpoint=field(setupPanel,t("Host URL (http:// 或 https://)","Host URL","Host URL"),false);
        allowLan=new CheckBox(this);
        allowLan.setText(t("本次允许我明确输入的局域网地址使用 HTTP",
            "Allow HTTP for this explicitly entered private LAN IP",
            "指定した LAN IP で HTTP を許可"));
        allowLan.setTextColor(Color.WHITE);setupPanel.addView(allowLan);
        save=action(setupPanel,t("保存配置","Save configuration","設定を保存"));
        enable=action(root,t("启用 / 停用 Host","Enable / disable Host","Host 有効／無効"));
        basicAuth=new CheckBox(this);
        basicAuth.setText(t("此 Host 使用 Basic 认证",
            "This Host uses Basic authentication","Basic 認証を使用"));
        basicAuth.setTextColor(Color.WHITE);setupPanel.addView(basicAuth);
        username=field(root,t("Basic 用户名（如有）","Basic username (if needed)","ユーザー名"),false);
        password=field(root,t("Basic 密码（如有）","Basic password (if needed)","パスワード"),true);
        username.setSaveEnabled(false);password.setSaveEnabled(false);
        username.setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_NO);
        password.setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_NO);
        // Auth mode is persisted; credentials remain visible only for a
        // user-authorized session and are never persisted or autofilled.
        basicAuth.setOnCheckedChangeListener((view,checked)->{
            username.setVisibility(checked?View.VISIBLE:View.GONE);
            password.setVisibility(checked?View.VISIBLE:View.GONE);
        });
        permission=new CheckBox(this);
        permission.setText(t("我授权本次连接自己的 Host","Authorize this Host session",
            "この接続を許可します"));
        permission.setTextColor(Color.WHITE);root.addView(permission);
        start=action(root,t("连接并读取来源","Connect and list sources","接続してソースを表示"));
        disconnect=action(root,t("断开会话","Disconnect","セッション終了"));
        refresh=action(root,t("刷新来源","Refresh sources","ソース更新"));
        sourceChoices=new Spinner(this);root.addView(sourceChoices);
        sourcePageStatus=text(t("尚未读取来源","Sources not loaded","ソース未取得"),13);
        sourcePageStatus.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
        root.addView(sourcePageStatus);
        LinearLayout pager=new LinearLayout(this);pager.setOrientation(LinearLayout.HORIZONTAL);
        root.addView(pager,new LinearLayout.LayoutParams(-1,dp(48)));
        previousSources=new Button(this);previousSources.setAllCaps(false);
        previousSources.setText(t("上一页","Previous","前へ"));
        pager.addView(previousSources,new LinearLayout.LayoutParams(0,-1,1));
        nextSources=new Button(this);nextSources.setAllCaps(false);
        nextSources.setText(t("下一页","Next","次へ"));
        pager.addView(nextSources,new LinearLayout.LayoutParams(0,-1,1));
        select=action(root,t("选择此来源","Use selected source","ソースを選択"));
        query=field(root,t("搜索作品","Search works","作品を検索"),false);
        query.setImeOptions(EditorInfo.IME_ACTION_SEARCH);
        search=action(root,t("搜索选中来源","Search selected source","選択ソースで検索"));
        query.setOnEditorActionListener((view,action,event)->{
            if(action==EditorInfo.IME_ACTION_SEARCH){search.performClick();return true;}
            return false;
        });
        results=new LinearLayout(this);results.setOrientation(LinearLayout.VERTICAL);
        root.addView(results);
        scroller=new ScrollView(this);scroller.setFillViewport(true);scroller.addView(root);
        setContentView(scroller);root.requestApplyInsets();

        save.setOnClickListener(v->{
            String name=label.getText().toString().trim();
            String url=endpoint.getText().toString().trim();
            boolean allow=allowLan.isChecked();
            // Auth mode is a saved descriptor, never persistent credentials.
            String mode=basicAuth.isChecked()?"basic":"none";
            long revision=manager.config().revision;
            task(t("保存中…","Saving…","保存中…"),()->{
                manager.configure(revision,name,url,mode,allow);
                return ()->{clearSources();results.removeAllViews();
                    setupPanel.setVisibility(View.GONE);
                    scroller.smoothScrollTo(0,0);
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
                return ()->{showSources(available,0);
                    status.setText(t("请选择来源","Select a source","ソースを選択"));};
            });
        });
        disconnect.setOnClickListener(v->{
            manager.end();clearSources();results.removeAllViews();
            permission.setChecked(false);
            status.setText(t("已断开","Disconnected","切断しました"));controls();
        });
        refresh.setOnClickListener(v->loadSources(sourceOffset));
        previousSources.setOnClickListener(v->loadSources(sourceOffset-25));
        nextSources.setOnClickListener(v->loadSources(sourceOffset+25));
        select.setOnClickListener(v->{
            int chosen=sourceChoices.getSelectedItemPosition();
            if(chosen<0||chosen>=sources.size())return;
            String id=sources.get(chosen).id;
            task(t("正在绑定来源…","Selecting source…","ソース選択中…"),()->{
                manager.bind(id,true);
                return ()->{status.setText(t("来源已就绪，可搜索","Source ready to search",
                    "検索できます"));
                    query.requestFocus();
                    scroller.post(()->scroller.smoothScrollTo(0,query.getTop()));};
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
        username.setVisibility(basicAuth.isChecked()?View.VISIBLE:View.GONE);
        password.setVisibility(basicAuth.isChecked()?View.VISIBLE:View.GONE);
        setupPanel.setVisibility(config.configured()?View.GONE:View.VISIBLE);
        status.setText(manager.hasSession()?t("会话已连接","Host session connected","接続済み"):
            t("尚未连接 Host","No Host connected","未接続"));
        controls();
    }

    private void loadSources(int offset){
        if(offset<0||offset>5000||offset%25!=0)return;
        task(t("读取来源…","Loading sources…","取得中…"),()->{
            HostProtocol.Sources page=manager.sources(offset);
            return ()->showSources(page,offset);
        });
    }
    private void clearSources(){
        sources.clear();sourceOffset=0;sourceHasNext=false;
        sourceChoices.setAdapter(new ArrayAdapter<>(this,
            android.R.layout.simple_spinner_dropdown_item,new ArrayList<String>()));
        sourcePageStatus.setText(t("尚未读取来源","Sources not loaded","ソース未取得"));
    }
    private void showSources(HostProtocol.Sources page,int offset){
        sources.clear();sources.addAll(page.rows);
        sourceOffset=offset;sourceHasNext=page.next;
        List<String> labels=new ArrayList<>();
        for(HostProtocol.Source item:sources)labels.add(item.name+" · "+item.language);
        sourceChoices.setAdapter(new ArrayAdapter<>(this,
            android.R.layout.simple_spinner_dropdown_item,labels));
        int first=page.rows.isEmpty()?0:offset+1,last=offset+page.rows.size();
        sourcePageStatus.setText(page.rows.isEmpty()?
            t("本页没有来源，请在自己的 Host 中管理扩展。",
              "No sources on this page. Manage extensions in your Host.",
              "このページにソースはありません。Host 側で管理してください。"):
            t("已安装来源 "+first+"–"+last+(page.next?" · 还有下一页":""),
              "Installed sources "+first+"–"+last+(page.next?" · more available":""),
              "導入済みソース "+first+"–"+last+(page.next?" · 次ページあり":"")));
        controls();
    }

    private void showResults(List<HostSourceManager.Book> books){
        results.removeAllViews();
        if(books.isEmpty()){
            results.addView(text(t("没有匹配作品","No matches","一致する作品なし"),14));
            return;
        }
        for(HostSourceManager.Book book:books){
            results.addView(text(book.title,17));
            Button read=action(results,t("阅读","Read","読む")+" · "+book.title);
            read.setOnClickListener(v->openOwnedReader(book,false));
            Button save=action(results,t("保存到阅读器书库",
                "Save to Reader library","Reader 書庫に保存"));
            save.setOnClickListener(v->openOwnedReader(book,true));
        }
    }
    private void openOwnedReader(HostSourceManager.Book book,boolean save){
        if(!trustedReader()){
            status.setText(t("未找到同签名的阅读器，无法转入作品。",
                "Matching signed Reader not found; cannot open work.",
                "同じ署名の Reader が見つかりません。"));
            return;
        }
        // This source-only APK has NO local Reader or duplicate book inventory.
        // Selection and consent remain in the original HostSourceManager.
        task(t("准备来源…","Preparing source…","ソース準備中…"),()->{
            manager.select(book.id);
            String scope=manager.requireSession().scope;
            return ()->{
                Intent intent=new Intent().setClassName(
                    readerPackage,
                    save?"com.picalibrary.android.ExternalImportActivity":
                        "com.picalibrary.android.ExternalReaderActivity")
                    .putExtra("scope",scope).putExtra("comicId",book.id)
                    .putExtra("title",book.title);
                if(!save)intent.putExtra("source","host");
                try{startActivity(intent);}
                catch(android.content.ActivityNotFoundException|SecurityException failure){
                    status.setText(t("请安装同一签名的独立阅读器",
                        "Install the matching signed Reader",
                        "同じ署名の Reader が必要です"));
                }
            };
        });
    }
    @Override protected void onResume(){
        super.onResume();
        if(manager!=null)controls();
    }
    @Override protected void onDestroy(){
        destroyed=true;executor.shutdownNow();super.onDestroy();
    }
}
