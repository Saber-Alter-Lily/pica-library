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
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
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
    private final List<HostSavedBooks.Book> savedRows=new ArrayList<>();
    private final Map<Button,HostSavedBooks.Book> savedResumeButtons=new LinkedHashMap<>();
    private HostSourceManager manager;
    private EditText label,endpoint,username,password,query;
    private CheckBox allowLan,permission,basicAuth;
    private Spinner sourceChoices;
    private TextView sourcePageStatus,resultPageStatus;
    private LinearLayout results,setupPanel,savedPanel,savedResults;
    private Button toggleSetup;
    private ScrollView scroller;
    private TextView status,savedStatus;
    private Button save,enable,start,disconnect,refresh,select,search,previousSources,nextSources,previousResults,nextResults,savedToggle,savedPrevious,savedNext;
    private boolean busy,destroyed;
    private int generation,sourceOffset,searchPage,savedOffset;
    private boolean sourceHasNext,searchHasNext;
    private String searchQuery="";
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
        previousResults.setEnabled(!busy&&session&&!manager.selectedSource().isEmpty()&&searchPage>1);
        nextResults.setEnabled(!busy&&session&&!manager.selectedSource().isEmpty()&&searchHasNext&&searchPage<200);
        savedToggle.setEnabled(!busy);
        savedPrevious.setEnabled(!busy&&savedOffset>=20);
        savedNext.setEnabled(!busy&&savedOffset+20<savedRows.size());
        for(Map.Entry<Button,HostSavedBooks.Book> entry:savedResumeButtons.entrySet())
            entry.getKey().setEnabled(!busy&&manager.canResumeSaved(entry.getValue()));
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
        resultPageStatus=text(t("尚未搜索作品","No search performed","まだ検索していません"),13);
        resultPageStatus.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
        resultPageStatus.setTag("host.qa.results.page");
        root.addView(resultPageStatus);
        LinearLayout resultPager=new LinearLayout(this);
        resultPager.setOrientation(LinearLayout.HORIZONTAL);
        root.addView(resultPager,new LinearLayout.LayoutParams(-1,dp(48)));
        previousResults=new Button(this);previousResults.setAllCaps(false);
        previousResults.setText(t("上一批结果","Previous results","前の検索結果"));
        resultPager.addView(previousResults,new LinearLayout.LayoutParams(0,-1,1));
        nextResults=new Button(this);nextResults.setAllCaps(false);
        nextResults.setText(t("下一批结果","Next results","次の検索結果"));
        resultPager.addView(nextResults,new LinearLayout.LayoutParams(0,-1,1));
        query.setOnEditorActionListener((view,action,event)->{
            if(action==EditorInfo.IME_ACTION_SEARCH){search.performClick();return true;}
            return false;
        });
        results=new LinearLayout(this);results.setOrientation(LinearLayout.VERTICAL);
        root.addView(results);
        savedToggle=action(root,t("已保存的在线作品","Saved online works","保存済みオンライン作品"));
        savedPanel=new LinearLayout(this);savedPanel.setOrientation(LinearLayout.VERTICAL);
        root.addView(savedPanel);
        savedStatus=text("",13);savedStatus.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
        savedPanel.addView(savedStatus);
        LinearLayout savedPager=new LinearLayout(this);
        savedPager.setOrientation(LinearLayout.HORIZONTAL);
        savedPanel.addView(savedPager,new LinearLayout.LayoutParams(-1,dp(48)));
        savedPrevious=new Button(this);savedPrevious.setAllCaps(false);
        savedPrevious.setText(t("上一页书签","Previous bookmarks","前のブックマーク"));
        savedPager.addView(savedPrevious,new LinearLayout.LayoutParams(0,-1,1));
        savedNext=new Button(this);savedNext.setAllCaps(false);
        savedNext.setText(t("下一页书签","Next bookmarks","次のブックマーク"));
        savedPager.addView(savedNext,new LinearLayout.LayoutParams(0,-1,1));
        savedResults=new LinearLayout(this);savedResults.setOrientation(LinearLayout.VERTICAL);
        savedPanel.addView(savedResults);savedPanel.setVisibility(View.GONE);
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
                return ()->{clearSources();clearResults();
                    if(savedPanel.getVisibility()==View.VISIBLE)renderSaved();
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
            manager.end();clearSources();clearResults();
            if(savedPanel.getVisibility()==View.VISIBLE)renderSaved();
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
                return ()->{clearResults();
                    if(savedPanel.getVisibility()==View.VISIBLE)renderSaved();
                    status.setText(t("来源已就绪，可搜索","Source ready to search",
                    "検索できます"));
                    query.requestFocus();
                    scroller.post(()->scroller.smoothScrollTo(0,query.getTop()));};
            });
        });
        search.setOnClickListener(v->loadResults(query.getText().toString().trim(),1));
        previousResults.setOnClickListener(v->loadResults(searchQuery,searchPage-1));
        nextResults.setOnClickListener(v->loadResults(searchQuery,searchPage+1));
        savedToggle.setOnClickListener(v->{
            if(savedPanel.getVisibility()==View.VISIBLE){
                savedPanel.setVisibility(View.GONE);controls();
            }else loadSaved(0);
        });
        savedPrevious.setOnClickListener(v->loadSaved(savedOffset-20));
        savedNext.setOnClickListener(v->loadSaved(savedOffset+20));
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

    private void loadResults(String needle,int page){
        if(needle.isEmpty()||page<1||page>200)return;
        task(t("搜索中…","Searching…","検索中…"),()->{
            HostSourceManager.SearchResult found=manager.search(needle,page);
            return ()->showResults(found,needle,page);
        });
    }
    private void clearResults(){
        searchQuery="";searchPage=0;searchHasNext=false;
        results.removeAllViews();
        resultPageStatus.setText(t("尚未搜索作品","No search performed","まだ検索していません"));
    }
    private void showResults(HostSourceManager.SearchResult found,String needle,int page){
        searchQuery=needle;searchPage=page;searchHasNext=found.next;
        results.removeAllViews();
        int count=found.books.size();
        resultPageStatus.setText(t(
            "搜索第 "+page+" 页 · "+count+" 部"+(found.next?" · 还有下一页":""),
            "Search page "+page+" · "+count+" works"+(found.next?" · more available":""),
            "検索 "+page+" ページ · "+count+" 件"+(found.next?" · 次ページあり":"")));
        controls();
        scroller.post(()->scroller.smoothScrollTo(0,resultPageStatus.getTop()));
        if(found.books.isEmpty()){
            results.addView(text(t("没有匹配作品","No matches","一致する作品なし"),14));
            return;
        }
        for(HostSourceManager.Book book:found.books){
            results.addView(text(book.title,17));
            Button read=action(results,t("阅读","Read","読む")+" · "+book.title);
            read.setOnClickListener(v->openOwnedReader(book,false));
            Button save=action(results,t("保存到阅读器书库",
                "Save to Reader library","Reader 書庫に保存"));
            save.setOnClickListener(v->openOwnedReader(book,true));
            Button bookmark=action(results,t("保存在线书签（不下载）",
                "Save online bookmark (no download)","オンラインブックマークを保存"));
            bookmark.setOnClickListener(v->task(t("保存在线书签…",
                "Saving online bookmark…","ブックマークを保存中…"),()->{
                manager.select(book.id);
                manager.saveBook(book.id,true);
                List<HostSavedBooks.Book> list=manager.savedBooks();
                return ()->{
                    bookmark.setText(t("在线书签已保存","Online bookmark saved","保存しました"));
                    bookmark.setEnabled(false);
                    status.setText(t("仅保存作品索引，未下载漫画。",
                        "Saved the online locator only; no comic downloaded.",
                        "作品情報のみ保存しました。ダウンロードしていません。"));
                    if(savedPanel.getVisibility()==View.VISIBLE)showSaved(list,0);
                };
            }));
        }
    }
    private void loadSaved(int offset){
        if(offset<0)return;
        task(t("读取我的在线书签…","Loading online bookmarks…",
            "ブックマークを読み込み中…"),()->{
            List<HostSavedBooks.Book> list=manager.savedBooks();
            return ()->showSaved(list,offset);
        });
    }
    private void showSaved(List<HostSavedBooks.Book> rows,int offset){
        savedRows.clear();savedRows.addAll(rows);
        Collections.reverse(savedRows);
        int maximum=savedRows.isEmpty()?0:((savedRows.size()-1)/20)*20;
        savedOffset=Math.min(Math.max(0,offset),maximum);
        savedPanel.setVisibility(View.VISIBLE);
        renderSaved();
    }
    private void renderSaved(){
        savedResults.removeAllViews();savedResumeButtons.clear();
        int end=Math.min(savedOffset+20,savedRows.size());
        savedStatus.setText(t(
            "在线书签 "+savedRows.size()+" 部 · 显示 "+(savedRows.isEmpty()?0:savedOffset+1)+"–"+end+" · 非离线副本",
            "Online bookmarks "+savedRows.size()+" · showing "+(savedRows.isEmpty()?0:savedOffset+1)+"–"+end+" · not offline copies",
            "オンラインブックマーク "+savedRows.size()+" 件 · "+(savedRows.isEmpty()?0:savedOffset+1)+"–"+end+" · オフライン保存ではありません"));
        if(savedRows.isEmpty())
            savedResults.addView(text(t("还没有在线书签。可在搜索结果中单独保存。",
                "No online bookmarks. Save one from a search result.",
                "保存済みの作品はありません。検索結果から追加できます。"),14));
        for(int i=savedOffset;i<end;i++){
            HostSavedBooks.Book book=savedRows.get(i);
            savedResults.addView(text(book.title+" · "+book.hostLabel,16));
            Button resume=action(savedResults,t("继续在线阅读（需连接同一来源）",
                "Resume online (same source required)","オンライン読書を再開"));
            savedResumeButtons.put(resume,book);
            resume.setOnClickListener(v->resumeSaved(book));
            Button remove=action(savedResults,t("移除此在线书签",
                "Remove online bookmark","ブックマークを削除"));
            remove.setOnClickListener(v->new android.app.AlertDialog.Builder(this)
                .setTitle(t("移除在线书签？","Remove online bookmark?","ブックマークを削除しますか？"))
                .setMessage(t("只移除外接来源的作品索引，不删除已下载的本地漫画。",
                    "Removes only the online bookmark, never locally saved pages.",
                    "オンラインの作品情報のみ削除します。保存済みのページは削除しません。"))
                .setNegativeButton(t("取消","Cancel","キャンセル"),(dialog,which)->{})
                .setPositiveButton(t("移除","Remove","削除"),(dialog,which)->task(
                    t("移除书签…","Removing bookmark…","削除中…"),()->{
                        manager.removeSavedBook(book.comicId,true);
                        List<HostSavedBooks.Book> list=manager.savedBooks();
                        return ()->showSaved(list,savedOffset);
                    })).show());
        }
        controls();
    }
    private void resumeSaved(HostSavedBooks.Book book){
        if(!trustedReader()){
            status.setText(t("未找到同签名的阅读器，无法转入作品。",
                "Matching signed Reader not found; cannot open work.",
                "同じ署名の Reader が見つかりません。"));return;
        }
        task(t("恢复在线作品…","Resuming online work…","作品を再開中…"),()->{
            manager.resumeSavedBook(book.comicId,true);
            String scope=manager.requireSession().scope;
            return ()->launchReader(book.comicId,book.title,false,scope);
        });
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
            return ()->launchReader(book.id,book.title,save,scope);
        });
    }
    private void launchReader(String comicId,String title,boolean save,String scope){
        Intent intent=new Intent().setClassName(
            readerPackage,
            save?"com.picalibrary.android.ExternalImportActivity":
                 "com.picalibrary.android.ExternalReaderActivity")
            .putExtra("scope",scope).putExtra("comicId",comicId)
            .putExtra("title",title);
        if(!save)intent.putExtra("source","host");
        try{startActivity(intent);}
        catch(android.content.ActivityNotFoundException|SecurityException failure){
            status.setText(t("请安装同一签名的独立阅读器",
                "Install the matching signed Reader",
                "同じ署名の Reader が必要です"));
        }
    }
    @Override protected void onResume(){
        super.onResume();
        if(manager!=null)controls();
    }
    @Override protected void onDestroy(){
        destroyed=true;executor.shutdownNow();super.onDestroy();
    }
}
