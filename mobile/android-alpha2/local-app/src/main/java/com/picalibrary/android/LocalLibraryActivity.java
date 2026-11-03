package com.picalibrary.android;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.ActivityNotFoundException;
import com.picalibrary.android.local.LocalComicExporter;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.text.Editable;
import android.text.TextWatcher;
import android.text.TextUtils;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ListView;
import android.widget.ProgressBar;
import android.widget.TextView;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Explicit SAF import -> original LocalComicStore preview/commit -> original Reader.
 * Separate app identity and storage; no second importer, reader, account or source SDK.
 */
public final class LocalLibraryActivity extends Activity {
    private static final int PICK_FOLDER=7101, PICK_CBZ=7102, CREATE_CBZ=7103;
    private final ExecutorService worker=Executors.newSingleThreadExecutor();
    private final ArrayList<LocalComicReaderPort.Book> books=new ArrayList<>();
    private final ArrayList<LocalComicReaderPort.Book> inventory=new ArrayList<>();
    private final Map<String,ReaderHistoryLedger.Session> recent=new HashMap<>();
    private volatile boolean destroyed, cancelImport;
    private String query="";
    private int sortMode,readMode,refreshSerial;
    private EditText queryField;
    private Button sortButton,readButton,continueButton,sourceButton;
    private LocalComicReaderPort.Book continueBook;
    private ReaderHistoryLedger.Session continueSession;
    private LocalComicStore.Preview pending;
    private Button folderButton,cbzButton,cancelButton;
    private TextView status;
    private ProgressBar indicator,pageProgress;
    private ArrayAdapter<LocalComicReaderPort.Book> adapter;
    private boolean busy,exporting;
    private String exportComicId="";

    private String copy(String zh,String en,String ja){return LocalCopy.ui(this,zh,en,ja);}
    private int dp(int number){return Math.round(number*getResources().getDisplayMetrics().density);}
    private TextView label(String value,int size){
        TextView label=new TextView(this);
        label.setText(value);
        label.setTextColor(Color.WHITE);
        label.setTextSize(size);
        return label;
    }
    private Button action(String value){
        Button button=new Button(this);
        button.setText(value);
        button.setAllCaps(false);
        return button;
    }

    // A separately installed source is optional; the original Reader never
    // gains network, account or package-install permissions.
    private static final String SOURCE_PACKAGE="com.picalibrary.android.userhost.qa";
    private static final String SOURCE_ACTIVITY="com.picalibrary.android.HostBrowserActivity";

    private boolean sourceInstalled(){
        try{
            getPackageManager().getPackageInfo(SOURCE_PACKAGE,0);
            return true;
        }catch(android.content.pm.PackageManager.NameNotFoundException missing){
            return false;
        }
    }
    private boolean sourceTrusted(){
        if(getPackageManager().checkSignatures(getPackageName(),SOURCE_PACKAGE)!=
                android.content.pm.PackageManager.SIGNATURE_MATCH)return false;
        try{
            getPackageManager().getActivityInfo(
                new android.content.ComponentName(SOURCE_PACKAGE,SOURCE_ACTIVITY),0);
            return true;
        }catch(android.content.pm.PackageManager.NameNotFoundException missing){
            return false;
        }
    }
    private void refreshSourceButton(){
        if(sourceButton==null)return;
        sourceButton.setText(!sourceInstalled()?copy(
            "外接来源 · 未安装","External sources · not installed","外部ソース · 未インストール"):
            sourceTrusted()?copy(
            "我的外接来源 · 已安装","My external Host · installed","外部 Host · インストール済み"):
            copy("外接来源 · 签名不匹配","External source · untrusted signer",
                "外部ソース · 署名が不一致"));
    }
    private void sourceSettings(){
        startActivity(new Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
            Uri.fromParts("package",SOURCE_PACKAGE,null)));
    }
    private void openSourceActions(){
        if(!sourceInstalled()){
            new AlertDialog.Builder(this)
                .setTitle(copy("外接来源未安装","No source companion installed",
                    "外部ソースは未インストール"))
                .setMessage(copy(
                    "离线阅读不需要来源组件。需要联网来源时，请自行安装与阅读器由同一发布者签名的可信来源组件；本应用不会自动下载或运行第三方插件。",
                    "Local reading needs no companion. Install a trusted, matching-signer source component yourself if needed. This Reader never downloads or runs arbitrary plugins.",
                    "オフライン閲覧に拡張は不要です。利用する場合は同じ署名の信頼できる拡張を別途導入してください。"))
                .setPositiveButton(android.R.string.ok,null).show();
            return;
        }
        boolean trusted=sourceTrusted();
        String[] actions=trusted?new String[]{
            copy("打开来源设置","Open source settings","ソース設定を開く"),
            copy("在系统中管理／卸载来源","Manage or uninstall in Android settings",
                "Android 設定で管理／削除")}:
            new String[]{copy("在系统中检查／卸载不受信任的组件",
                "Inspect or uninstall untrusted component",
                "信頼できない拡張を確認／削除")};
        new AlertDialog.Builder(this)
            .setTitle(copy("外接来源管理","External source management","外部ソース管理"))
            .setMessage(trusted?copy(
                "来源仅在你主动连接后工作。卸载或更新来源不会删除阅读器已导入的漫画、书架与历史。",
                "Sources connect only on your action. Removing or updating the companion does not delete books, shelves or history already owned by this Reader.",
                "接続は明示的な操作時のみ。拡張の削除・更新で Reader の保存済みデータは削除されません。"):
                copy("组件签名与阅读器不匹配，不能连接或执行其服务。",
                    "This component does not match the Reader signature and cannot be connected.",
                    "署名が一致しないため接続できません。"))
            .setItems(actions,(dialog,which)->{
                if(trusted&&which==0){
                    try{
                        startActivity(new Intent().setClassName(
                            SOURCE_PACKAGE,SOURCE_ACTIVITY));
                    }catch(android.content.ActivityNotFoundException|SecurityException error){
                        refreshSourceButton();
                        android.widget.Toast.makeText(this,copy(
                            "来源已不可用","Source component unavailable",
                            "外部ソースを利用できません"),android.widget.Toast.LENGTH_LONG).show();
                    }
                }else{
                    sourceSettings();
                }
            })
            .setNegativeButton(android.R.string.cancel,null).show();
    }

    @Override public void onCreate(Bundle saved){
        super.onCreate(saved);
        if(saved!=null){
            exportComicId=saved.getString("pendingExportComicId","");
            query=saved.getString("libraryQuery","");
            sortMode=saved.getInt("librarySort",0);
            readMode=saved.getInt("libraryRead",0);
        }
        LinearLayout root=new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(16),dp(20),dp(16),dp(12));
        root.setBackgroundColor(Color.rgb(20,20,26));
        root.setOnApplyWindowInsetsListener((view,insets)->{
            view.setPadding(dp(16),insets.getSystemWindowInsetTop()+dp(12),
                            dp(16),insets.getSystemWindowInsetBottom()+dp(12));
            return insets;
        });
        TextView title=label(copy("本地漫画书库","Local library","ローカル書庫"),22);
        root.addView(title);
        TextView description=label(copy(
            "离线漫画始终可读；外部来源为可选组件，连接需由你授权。",
            "Offline books always work. External sources are optional and require your consent.",
            "オフライン閲覧は常に可能。外部ソースは任意で許可が必要です。"),12);
        description.setPadding(0,dp(6),0,dp(12));
        root.addView(description);

        LinearLayout actions=new LinearLayout(this);
        actions.setOrientation(LinearLayout.HORIZONTAL);
        folderButton=action(copy("导入文件夹","Import folder","フォルダー取込"));
        cbzButton=action(copy("导入 CBZ","Import CBZ","CBZ 取込"));
        actions.addView(folderButton,new LinearLayout.LayoutParams(0,dp(52),1));
        actions.addView(cbzButton,new LinearLayout.LayoutParams(0,dp(52),1));
        root.addView(actions);
        LinearLayout localSections=new LinearLayout(this);
        Button historyButton=action(copy("阅读历史","History","閲覧履歴"));
        Button shelvesButton=action(copy("书架","Shelves","本棚"));
        localSections.addView(shelvesButton,new LinearLayout.LayoutParams(0,dp(48),1));
        localSections.addView(historyButton,new LinearLayout.LayoutParams(0,dp(48),1));
        root.addView(localSections);
        sourceButton=action("");
        sourceButton.setTag("local-host-opt-in");
        sourceButton.setOnClickListener(v->openSourceActions());
        root.addView(sourceButton,new LinearLayout.LayoutParams(-1,dp(48)));
        refreshSourceButton();
        historyButton.setOnClickListener(v->startActivity(new Intent(this,LocalHistoryActivity.class)));
        shelvesButton.setOnClickListener(v->startActivity(new Intent(this,LocalShelvesActivity.class)));
        folderButton.setOnClickListener(v->choose(PICK_FOLDER));
        cbzButton.setOnClickListener(v->choose(PICK_CBZ));

        // Native Android controls, following Mihon's library browse pattern.
        // The immutable local manifest, shelves and history are the only data sources.
        LinearLayout browse=new LinearLayout(this);
        browse.setGravity(android.view.Gravity.CENTER_VERTICAL);
        queryField=new EditText(this);
        queryField.setSingleLine(true);
        queryField.setTextColor(Color.WHITE);
        queryField.setHintTextColor(Color.LTGRAY);
        queryField.setTextSize(14);
        queryField.setHint(copy("搜索已导入作品","Search imported comics","取込済み作品を検索"));
        queryField.setText(query);
        browse.addView(queryField,new LinearLayout.LayoutParams(0,dp(48),1));
        sortButton=compactAction();
        readButton=compactAction();
        browse.addView(sortButton,new LinearLayout.LayoutParams(dp(76),dp(48)));
        browse.addView(readButton,new LinearLayout.LayoutParams(dp(76),dp(48)));
        root.addView(browse);
        updateBrowseLabels();
        queryField.addTextChangedListener(new TextWatcher(){
            public void beforeTextChanged(CharSequence s,int start,int count,int after){}
            public void onTextChanged(CharSequence s,int start,int before,int count){
                query=s.toString();
                renderBooks();
            }
            public void afterTextChanged(Editable value){}
        });
        sortButton.setOnClickListener(v->new AlertDialog.Builder(this)
            .setTitle(copy("书库排序","Sort library","書庫の並び替え"))
            .setSingleChoiceItems(new String[]{
                copy("最近导入","Recently imported","最近取り込んだ順"),
                copy("标题 A-Z","Title A-Z","タイトル順"),
                copy("页数从多到少","Most pages","ページ数の多い順")
            },sortMode,(dialog,which)->{
                sortMode=which;
                updateBrowseLabels();
                renderBooks();
                dialog.dismiss();
            }).setNegativeButton(android.R.string.cancel,null).show());
        readButton.setOnClickListener(v->new AlertDialog.Builder(this)
            .setTitle(copy("阅读状态","Reading status","閲覧状態"))
            .setSingleChoiceItems(new String[]{
                copy("全部","All","すべて"),
                copy("未读","Unread","未読"),
                copy("已读","Read","既読")
            },readMode,(dialog,which)->{
                readMode=which;
                updateBrowseLabels();
                renderBooks();
                dialog.dismiss();
            }).setNegativeButton(android.R.string.cancel,null).show());
        continueButton=action("");
        continueButton.setSingleLine(true);
        continueButton.setEllipsize(TextUtils.TruncateAt.END);
        continueButton.setVisibility(View.GONE);
        continueButton.setOnClickListener(v->{
            if(!busy&&continueBook!=null&&continueSession!=null)
                openBook(continueBook,continueSession);
        });
        root.addView(continueButton,new LinearLayout.LayoutParams(-1,dp(48)));
        // Avoid opening the keyboard every time this QA-only library starts.
        root.setFocusableInTouchMode(true);
        root.requestFocus();

        LinearLayout taskBar=new LinearLayout(this);
        taskBar.setGravity(android.view.Gravity.CENTER_VERTICAL);
        indicator=new ProgressBar(this);
        indicator.setIndeterminate(true);
        taskBar.addView(indicator,new LinearLayout.LayoutParams(dp(28),dp(28)));
        status=label(copy("读取书库中…","Loading library…","書庫を読み込み中…"),13);
        status.setPadding(dp(8),dp(10),dp(8),dp(10));
        taskBar.addView(status,new LinearLayout.LayoutParams(0,-2,1));
        cancelButton=action(copy("取消","Cancel","キャンセル"));
        taskBar.addView(cancelButton);
        cancelButton.setOnClickListener(v->{
            if(!busy)return;
            cancelImport=true;
            cancelButton.setEnabled(false);
            status.setText(exporting?
                copy("正在取消导出…","Cancelling export…","書き出しを中止中…"):
                copy("正在取消导入…","Cancelling import…","取り込みを中止中…"));
        });
        root.addView(taskBar);
        // Reuse the original importer's per-page callback; keep the spinner for
        // SAF inventory and CBZ staging, and show determinate copy progress.
        pageProgress=new ProgressBar(this,null,android.R.attr.progressBarStyleHorizontal);
        pageProgress.setVisibility(View.GONE);
        root.addView(pageProgress,new LinearLayout.LayoutParams(-1,dp(4)));

        ListView list=new ListView(this);
        list.setDividerHeight(dp(1));
        adapter=new ArrayAdapter<LocalComicReaderPort.Book>(this,android.R.layout.simple_list_item_1,books){
            @Override public View getView(int position,View convertView,ViewGroup parent){
                TextView item=convertView instanceof TextView?(TextView)convertView:label("",16);
                LocalComicReaderPort.Book book=getItem(position);
                if(book!=null){
                    ReaderHistoryLedger.Session last=recent.get(book.id);
                    item.setText(book.title+"\n"+book.pageCount+
                        copy(" 页 · 点击阅读，长按操作"," pages · Tap to read; hold for actions",
                             " ページ · タップで読む、長押しで操作")+
                        (last==null?"":copy(" · 续读第 "," · Resume page "," · 続きは")+
                            (last.lastPage+1)+copy("页","","ページ")));
                }
                item.setPadding(dp(10),dp(13),dp(10),dp(13));
                item.setMinHeight(dp(64));
                return item;
            }
        };
        list.setAdapter(adapter);
        list.setOnItemClickListener((parent,view,position,id)->{
            if(busy||position<0||position>=books.size())return;
            LocalComicReaderPort.Book book=books.get(position);
            openBook(book,recent.get(book.id));
        });
        list.setOnItemLongClickListener((parent,view,position,id)->{
            if(busy||position<0||position>=books.size())return true;
            LocalComicReaderPort.Book book=books.get(position);
            boolean canResume=recent.containsKey(book.id);
            String[] options=canResume?new String[]{
                copy("继续阅读","Continue reading","続きを読む"),
                copy("加入书架","Add to shelf","本棚に追加"),
                copy("导出 CBZ","Export CBZ","CBZ に書き出す"),
                copy("删除本地副本","Remove local copy","ローカルコピーを削除")
            }:new String[]{
                copy("加入书架","Add to shelf","本棚に追加"),
                copy("导出 CBZ","Export CBZ","CBZ に書き出す"),
                copy("删除本地副本","Remove local copy","ローカルコピーを削除")
            };
            new AlertDialog.Builder(this).setTitle(book.title)
                .setItems(options,(dialog,choice)->{
                    int index=choice;
                    if(canResume){
                        if(index==0){openBook(book,recent.get(book.id));return;}
                        index--;
                    }
                    if(index==0){addToShelf(book);return;}
                    if(index==1){chooseExport(book);return;}
                    new AlertDialog.Builder(this)
                        .setTitle(copy("删除此本地副本？","Remove local copy?","ローカルコピーを削除しますか？"))
                        .setMessage(book.title)
                        .setNegativeButton(android.R.string.cancel,null)
                        .setPositiveButton(copy("删除","Remove","削除"),(confirm,which)->remove(book.id)).show();
                }).show();
            return true;
        });
        root.addView(list,new LinearLayout.LayoutParams(-1,0,1));
        setContentView(root);
        setWorking(false,false);
        refresh();
    }

    @Override protected void onSaveInstanceState(Bundle state){
        state.putString("pendingExportComicId",exportComicId);
        state.putString("libraryQuery",query);
        state.putInt("librarySort",sortMode);
        state.putInt("libraryRead",readMode);
        super.onSaveInstanceState(state);
    }

    @Override protected void onResume(){
        super.onResume();
        refreshSourceButton();
        if(adapter!=null&&!busy&&pending==null)refresh();
    }

    private void setWorking(boolean working,boolean canCancel){
        busy=working;
        if(!working)exporting=false;
        folderButton.setEnabled(!working&&pending==null);
        cbzButton.setEnabled(!working&&pending==null);
        indicator.setVisibility(working?View.VISIBLE:View.GONE);
        if(!working)pageProgress.setVisibility(View.GONE);
        cancelButton.setVisibility(working&&canCancel?View.VISIBLE:View.GONE);
        cancelButton.setEnabled(canCancel);
        if(sortButton!=null)sortButton.setEnabled(!working);
        if(readButton!=null)readButton.setEnabled(!working);
        if(continueButton!=null)continueButton.setEnabled(!working&&pending==null);
    }

    private Button compactAction(){
        Button button=action("");
        button.setTextSize(12);
        button.setMinWidth(0);
        button.setPadding(0,0,0,0);
        return button;
    }

    private void updateBrowseLabels(){
        if(sortButton!=null)sortButton.setText((sortMode==1?
            copy("标题","Title","名前"):sortMode==2?
            copy("页数","Pages","ページ"):
            copy("最近","Recent","最近"))+" ▾");
        if(readButton!=null)readButton.setText((readMode==1?
            copy("未读","Unread","未読"):readMode==2?
            copy("已读","Read","既読"):
            copy("全部","All","すべて"))+" ▾");
    }

    private void openBook(LocalComicReaderPort.Book book,ReaderHistoryLedger.Session last){
        if(busy)return;
        Intent open=new Intent(this,LocalReaderActivity.class);
        open.putExtra("source","local");
        open.putExtra("comicId",book.id);
        open.putExtra("title",book.title);
        if(last!=null&&!last.chapterId.isEmpty()){
            ReaderProgressLedger.seedOneShotPosition(this,book.id,last.chapterId,last.lastPage);
            open.putExtra("episodeId",last.chapterId);
        }
        startActivity(open);
    }

    private void addToShelf(LocalComicReaderPort.Book book){
        if(busy||pending!=null)return;
        worker.execute(()->{
            List<ShelfLedger.Shelf> choices=new ArrayList<>();
            for(ShelfLedger.Shelf shelf:ShelfLedger.load(
                    ShelfLedger.localFile(getApplicationContext())).activeShelves()){
                boolean member=false;
                for(ShelfLedger.Item item:shelf.activeItems())
                    if(book.id.equals(item.comicId)){member=true;break;}
                if(!member)choices.add(shelf);
            }
            runOnUiThread(()->{
                if(destroyed||busy||pending!=null)return;
                if(choices.isEmpty()){
                    new AlertDialog.Builder(this)
                        .setMessage(copy("没有可加入的书架。可以到书架页面新建，或作品已加入所有书架。",
                            "No available shelf. Create one in Shelves, or this comic is already on every shelf.",
                            "追加できる本棚がありません。本棚を作成するか、すでにすべてに追加されています。"))
                        .setPositiveButton(copy("查看书架","Open shelves","本棚を見る"),
                            (d,w)->startActivity(new Intent(this,LocalShelvesActivity.class)))
                        .setNegativeButton(android.R.string.cancel,null).show();
                    return;
                }
                String[] names=new String[choices.size()];
                for(int i=0;i<choices.size();i++)names[i]=choices.get(i).name;
                new AlertDialog.Builder(this)
                    .setTitle(copy("加入书架","Add to shelf","本棚に追加"))
                    .setItems(names,(dialog,which)->{
                        ShelfLedger.Shelf selected=choices.get(which);
                        setWorking(true,false);
                        status.setText(copy("正在加入书架…","Adding to shelf…","本棚に追加中…"));
                        worker.execute(()->{
                            String failure=null;
                            try{
                                ShelfLedger.Item item=new ShelfLedger.Item(
                                    book.id,book.title,"","",
                                    java.util.Collections.emptyList(),
                                    java.util.Collections.emptyList(),
                                    false,0,book.pageCount,ShelfLedger.now());
                                ShelfLedger.setMembership(
                                    ShelfLedger.localFile(getApplicationContext()),
                                    selected.id,item,true);
                            }catch(Exception e){failure=e.getMessage();}
                            String error=failure;
                            runOnUiThread(()->{
                                if(destroyed)return;
                                setWorking(false,false);
                                if(error!=null)status.setText(copy("加入书架失败：",
                                    "Add to shelf failed: ","本棚への追加に失敗：")+error);
                                else refresh();
                            });
                        });
                    }).setNegativeButton(android.R.string.cancel,null).show();
            });
        });
    }

    private void renderBooks(){
        if(adapter==null)return;
        List<LocalComicReaderPort.Book> visible=
                LocalLibraryBrowse.visible(inventory,recent,query,sortMode,readMode);
        books.clear();
        books.addAll(visible);
        adapter.notifyDataSetChanged();

        continueSession=LocalLibraryBrowse.newest(recent);
        continueBook=LocalLibraryBrowse.bookFor(inventory,continueSession);
        if(continueButton!=null){
            continueButton.setVisibility(continueBook==null?View.GONE:View.VISIBLE);
            if(continueBook!=null)continueButton.setText(copy("继续阅读 · ",
                "Continue reading · ","続きを読む · ")+continueBook.title);
        }
        if(!busy&&pending==null)status.setText(inventory.isEmpty()?
            copy("书库为空，选择文件夹或 CBZ 导入。","Empty library. Import a folder or CBZ.",
                 "書庫は空です。フォルダーか CBZ を取り込んでください。"):
            (visible.isEmpty()?copy("没有匹配的作品：","No matching comics: ","一致する作品なし："):
                copy("本地作品：","Imported comics: ","取込済み作品："))+
            visible.size()+"/"+inventory.size());
    }

    private void choose(int request){
        if(busy||pending!=null)return;
        Intent picker;
        if(request==PICK_FOLDER){
            picker=new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        }else{
            picker=new Intent(Intent.ACTION_OPEN_DOCUMENT);
            picker.addCategory(Intent.CATEGORY_OPENABLE);
            picker.setType("*/*");
        }
        picker.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        startActivityForResult(picker,request);
    }

    @Override protected void onActivityResult(int request,int result,Intent data){
        super.onActivityResult(request,result,data);
        if(request==CREATE_CBZ){
            String id=exportComicId;exportComicId="";
            if(!id.isEmpty()&&result==RESULT_OK&&data!=null&&data.getData()!=null&&!busy&&pending==null)
                startExport(id,data.getData());
            else if(!id.isEmpty())
                status.setText(copy("未开始导出","Export not started","書き出しを開始しませんでした"));
            return;
        }
        if(result!=RESULT_OK||data==null||data.getData()==null||busy||pending!=null)return;
        if(request!=PICK_FOLDER&&request!=PICK_CBZ)return;
        startImport(data.getData(),request==PICK_FOLDER?"folder":"cbz");
    }

    private void refresh(){
        int serial=++refreshSerial;
        worker.execute(()->{
            List<LocalComicReaderPort.Book> found=
                    new LocalComicReaderPort(getApplicationContext()).books();
            Map<String,ReaderHistoryLedger.Session> read=LocalLibraryBrowse.latestFor(
                    found,ReaderHistoryLedger.load(
                            ReaderHistoryLedger.localFile(getApplicationContext())));
            runOnUiThread(()->{
                if(destroyed||serial!=refreshSerial)return;
                inventory.clear();
                inventory.addAll(found);
                recent.clear();
                recent.putAll(read);
                renderBooks();
            });
        });
    }

    private void chooseExport(LocalComicReaderPort.Book book){
        if(busy||pending!=null||!exportComicId.isEmpty())return;
        exportComicId=book.id;
        Intent intent=new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("application/vnd.comicbook+zip");
        intent.putExtra(Intent.EXTRA_TITLE,LocalComicExports.filename(book.title));
        intent.putExtra(Intent.EXTRA_LOCAL_ONLY,true);
        intent.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        try{startActivityForResult(intent,CREATE_CBZ);}
        catch(ActivityNotFoundException error){
            exportComicId="";
            status.setText(copy("没有可用的文件保存选择器","No document save picker available",
                                "保存先の選択画面がありません"));
        }
    }

    private void startExport(String id,Uri destination){
        cancelImport=false;
        exporting=true;
        pageProgress.setVisibility(View.GONE);
        setWorking(true,true);
        status.setText(copy("正在准备并导出 CBZ…","Preparing and exporting CBZ…",
                            "CBZ を準備して書き出しています…"));
        worker.execute(()->{
            try(LocalComicExports.Stage stage=LocalComicExports.prepare(
                    getApplicationContext(),id,()->{
                        if(cancelImport||destroyed||Thread.currentThread().isInterrupted())
                            throw new IOException("Export cancelled");
                    })){
                LocalComicExports.copyToDocument(getApplicationContext(),stage,destination,()->{
                    if(cancelImport||destroyed||Thread.currentThread().isInterrupted())
                        throw new IOException("Export cancelled");
                });
                LocalComicExporter.Result receipt=stage.result;
                runOnUiThread(()->{
                    if(destroyed)return;
                    setWorking(false,false);
                    status.setText(copy("CBZ 导出完成（仅包含漫画图片）：",
                        "CBZ exported (comic pages only):",
                        "CBZ を書き出しました（画像のみ）：")
                        +" "+receipt.pages+copy(" 页"," pages"," ページ")
                        +"\nSHA-256: "+receipt.sha256);
                });
            }catch(Exception|OutOfMemoryError error){
                String message=error.getMessage();
                runOnUiThread(()->{
                    if(destroyed)return;
                    boolean cancelled=cancelImport;
                    setWorking(false,false);
                    status.setText(cancelled?
                        copy("导出已取消。所选位置可能留有未完成文件。",
                            "Export cancelled. The destination may contain an incomplete file.",
                            "書き出しを中止しました。保存先に不完全なファイルが残る場合があります。"):
                        copy("导出失败，所选位置可能留有未完成文件：",
                             "Export failed; destination may contain an incomplete file: ",
                             "書き出しに失敗しました。保存先に不完全なファイルが残る場合があります：")
                        +(message==null?"":message.substring(0,Math.min(180,message.length()))));
                });
            }
        });
    }

    private void startImport(Uri uri,String kind){
        cancelImport=false;
        pageProgress.setVisibility(View.GONE);
        setWorking(true,true);
        status.setText(copy("正在导入并检查图片…","Importing and checking pages…",
                            "ページを取り込み・確認中…"));
        worker.execute(()->{
            LocalComicStore.Preview staged=null;
            try{
                staged=LocalComicStore.prepare(getApplicationContext(),uri,kind,()->{
                    if(cancelImport||destroyed||Thread.currentThread().isInterrupted())
                        throw new IOException("Import cancelled");
                },(complete,total)->{
                    if(complete!=1&&complete!=total&&complete%8!=0)return;
                    runOnUiThread(()->{
                        if(destroyed||cancelImport||pending!=null||!busy)return;
                        pageProgress.setVisibility(View.VISIBLE);
                        pageProgress.setMax(total);
                        pageProgress.setProgress(complete);
                        status.setText(copy("正在导入图片 ","Importing pages ","画像を取り込み中 ")+complete+"/"+total);
                    });
                });
                LocalComicStore.Preview ready=staged;
                staged=null;
                runOnUiThread(()->{
                    if(destroyed){ready.close();return;}
                    pending=ready;
                    setWorking(false,false);
                    new AlertDialog.Builder(this)
                        .setTitle(copy("确认导入？","Import this comic?","取り込みますか？"))
                        .setMessage(ready.title)
                        .setNegativeButton(android.R.string.cancel,(dialog,which)->discard(ready))
                        .setOnCancelListener(dialog->discard(ready))
                        .setPositiveButton(copy("保存到书库","Save to library","書庫に保存"),
                            (dialog,which)->commit(ready))
                        .show();
                });
            }catch(Exception error){
                String message=error.getMessage();
                runOnUiThread(()->{
                    if(destroyed)return;
                    setWorking(false,false);
                    status.setText(cancelImport?
                        copy("导入已取消","Import cancelled","取込を中止しました"):
                        copy("导入失败：","Import failed: ","取込失敗：")+
                        (message==null?"":message.substring(0,Math.min(180,message.length()))));
                });
            }finally{if(staged!=null)staged.close();}
        });
    }

    private void discard(LocalComicStore.Preview ready){
        if(pending==ready)pending=null;
        ready.close();
        setWorking(false,false);
        status.setText(copy("已取消保存","Save cancelled","保存を中止しました"));
    }

    private void commit(LocalComicStore.Preview ready){
        pending=null;
        pageProgress.setVisibility(View.GONE);
        setWorking(true,false);
        status.setText(copy("正在保存到书库…","Saving comic…","書庫に保存中…"));
        worker.execute(()->{
            try{
                LocalComicStore.confirm(getApplicationContext(),ready,()->{
                    if(destroyed||Thread.currentThread().isInterrupted())
                        throw new IOException("Import interrupted");
                });
                runOnUiThread(()->{
                    if(destroyed)return;
                    setWorking(false,false);
                    status.setText(copy("导入完成","Import complete","取込が完了しました"));
                    refresh();
                });
            }catch(Exception error){
                String message=error.getMessage();
                runOnUiThread(()->{
                    if(destroyed)return;
                    setWorking(false,false);
                    status.setText(copy("保存失败：","Save failed: ","保存失敗：")+
                        (message==null?"":message.substring(0,Math.min(180,message.length()))));
                });
            }finally{ready.close();}
        });
    }

    private void remove(String comicId){
        pageProgress.setVisibility(View.GONE);
        setWorking(true,false);
        status.setText(copy("正在删除本地副本…","Removing local copy…","ローカルコピーを削除中…"));
        worker.execute(()->{
            try{
                LocalComicStore.remove(getApplicationContext(),comicId);
                runOnUiThread(()->{
                    if(destroyed)return;
                    setWorking(false,false);
                    refresh();
                });
            }catch(Exception error){
                runOnUiThread(()->{
                    if(destroyed)return;
                    setWorking(false,false);
                    status.setText(copy("删除失败","Remove failed","削除できませんでした"));
                });
            }
        });
    }

    @Override protected void onDestroy(){
        destroyed=true;
        cancelImport=true;
        if(pending!=null){pending.close();pending=null;}
        worker.shutdownNow();
        super.onDestroy();
    }
}
