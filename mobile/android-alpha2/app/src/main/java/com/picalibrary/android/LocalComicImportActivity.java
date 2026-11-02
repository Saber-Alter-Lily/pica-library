package com.picalibrary.android;

import android.app.AlertDialog;
import android.content.*;
import android.net.Uri;
import android.os.*;
import android.text.Editable;
import android.text.TextWatcher;
import android.view.*;
import android.widget.*;
import java.io.IOException;
import java.util.*;
import java.util.concurrent.*;

/** Explicit picker → bounded private staging → preview → confirmed manifest commit. */
public class LocalComicImportActivity extends LocaleAwareActivity {
    private static final int FOLDER=8141,CBZ=8142;
    private Session session;
    private LinearLayout body;
    private ProgressBar importProgress;
    private TextView importProgressText;
    private String browseQuery="";
    private int browseSort,browseRead;
    private TextView browseCount;
    private LinearLayout browseRows;
    private Button browseSortButton,browseReadButton;
    static final class Session implements AutoCloseable {
        final Context context;
        final ExecutorService worker=Executors.newSingleThreadExecutor();
        final Handler main=new Handler(Looper.getMainLooper());
        volatile boolean busy,closed,cancelled,importing;
        volatile int copiedPages,totalPages;
        volatile String error="";
        volatile LocalComicStore.Preview preview;
        volatile List<LocalComicStore.Comic> comics=Collections.emptyList();
        volatile List<LocalComicReaderPort.Book> books=Collections.emptyList();
        volatile Map<String,ReaderHistoryLedger.Session> recent=Collections.emptyMap();
        volatile String actionNotice="";
        volatile Runnable changed,progressChanged;
        void copyProgress(int complete,int total){
            copiedPages=complete;totalPages=total;
            if(complete==1||complete==total||complete%8==0)
                main.post(()->{Runnable listener=progressChanged;if(!closed&&listener!=null)listener.run();});
        }
        Session(Context context){this.context=context.getApplicationContext();}
        void notifyUi(){main.post(()->{Runnable listener=changed;if(!closed&&listener!=null)listener.run();});}
        void check() throws IOException {if(closed||cancelled||Thread.currentThread().isInterrupted())throw new IOException("Import cancelled");}
        synchronized void select(Uri uri,String kind){
            if(busy||closed)return;discard();busy=true;importing=true;cancelled=false;copiedPages=0;totalPages=0;error="";notifyUi();
            worker.submit(()->{LocalComicStore.Preview next=null;try{next=LocalComicStore.prepare(context,uri,kind,this::check,this::copyProgress);synchronized(this){check();preview=next;next=null;}}catch(Exception|OutOfMemoryError e){if(!closed)error=message(e);}finally{if(next!=null)next.close();synchronized(this){busy=false;importing=false;if(closed)discard();}notifyUi();}});
        }
        synchronized void confirm(){if(busy||preview==null||closed)return;busy=true;importing=false;error="";notifyUi();worker.submit(()->{try{check();LocalComicStore.confirm(context,preview,this::check);preview=null;refreshBooks();try{UnifiedCatalogStore.reconcileLocalReferences(context);}catch(Exception catalogError){error=context.getString(R.string.local_import_catalog_pending);}}catch(Exception|OutOfMemoryError e){error=message(e);discard();}finally{busy=false;notifyUi();}});}
        synchronized void discard(){LocalComicStore.Preview old=preview;preview=null;if(old!=null)old.close();}
        private void refreshBooks(){
            comics=LocalComicStore.list(context);
            List<LocalComicReaderPort.Book> next=new LocalComicReaderPort(context).books();
            books=next;
            recent=LocalLibraryBrowse.latestFor(next,ReadingHistoryStore.load(context));
        }
        void load(){if(!closed)worker.submit(()->{refreshBooks();notifyUi();});}
        synchronized void addToShelf(String shelfId,LocalComicReaderPort.Book book,String newShelfName){
            if(busy||closed)return;
            busy=true;error="";actionNotice="";notifyUi();
            worker.submit(()->{
                try {
                    if(!LocalComicStore.has(context,book.id))
                        throw new IOException("Local comic is unavailable");
                    String target=shelfId;
                    if(newShelfName!=null)target=ShelfStore.create(context,newShelfName).id;
                    UnifiedCatalogStore.Entry entry=UnifiedCatalogStore.load(context).byId.get(book.id);
                    if(entry==null)entry=new UnifiedCatalogStore.Entry(book.id,book.title,"");
                    entry.localImported=true;
                    entry.providerId="local";
                    entry.knownPictures=Math.max(entry.knownPictures,book.pageCount);
                    ShelfStore.setMembership(context,target,entry,true);
                    actionNotice=LocalizedText.ui(context,"已加入书架",
                            "Added to shelf","本棚に追加しました");
                }catch(Exception ex){actionNotice=LocalizedText.ui(context,
                    "加入书架失败：","Add to shelf failed: ","本棚への追加に失敗：")+message(ex);}
                finally {busy=false;notifyUi();}
            });
        }
        synchronized void remove(String id){if(busy||closed)return;busy=true;error="";notifyUi();worker.submit(()->{try{LocalComicStore.remove(context,id);refreshBooks();}catch(Exception e){error=e instanceof LocalComicStore.ExportBusyException?context.getString(R.string.local_export_busy):message(e);}finally{busy=false;notifyUi();}});}
        private static String message(Throwable error){String text=error.getMessage();return text==null||text.length()>200?"Unable to import this comic":text;}
        @Override public synchronized void close(){closed=true;cancelled=true;changed=null;progressChanged=null;worker.shutdownNow();discard();}
    }
    @Override public void onCreate(Bundle saved){
        super.onCreate(saved);
        if(saved!=null){
            browseQuery=saved.getString("localBrowseQuery","");
            browseSort=saved.getInt("localBrowseSort",0);
            browseRead=saved.getInt("localBrowseRead",0);
        }
        Ui.applyWindow(this);
        Object retained=getLastNonConfigurationInstance();
        session=retained instanceof Session?(Session)retained:new Session(this);
        session.changed=this::render;
        session.progressChanged=this::updateImportProgress;
        render();
    }
    @Override protected void onResume(){
        super.onResume();
        if(session!=null&&!session.busy)session.load();
    }
    @Override protected void onSaveInstanceState(Bundle state){
        state.putString("localBrowseQuery",browseQuery);
        state.putInt("localBrowseSort",browseSort);
        state.putInt("localBrowseRead",browseRead);
        super.onSaveInstanceState(state);
    }
    @Override public Object onRetainNonConfigurationInstance(){return session;}
    @Override protected void onDestroy(){session.changed=null;session.progressChanged=null;if(!isChangingConfigurations())session.close();super.onDestroy();}
    private void updateImportProgress(){
        if(!session.importing||importProgress==null||importProgressText==null||session.totalPages<1)return;
        importProgress.setIndeterminate(false);
        importProgress.setMax(session.totalPages);
        importProgress.setProgress(session.copiedPages);
        importProgressText.setText(getString(R.string.local_import_progress,session.copiedPages,session.totalPages));
    }
    private Button action(String text,String tag,Runnable run){Button button=new Button(this);button.setAllCaps(false);button.setText(text);button.setTag(tag);button.setEnabled(!session.busy);button.setOnClickListener(v->run.run());return button;}
    private void render(){
        if(isFinishing()||isDestroyed())return;
        importProgress=null;importProgressText=null;
        browseRows=null;browseCount=null;browseSortButton=null;browseReadButton=null;
        LinearLayout root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);root.setBackgroundColor(Ui.BG);root.setOnApplyWindowInsetsListener((v,i)->{v.setPadding(0,i.getSystemWindowInsetTop(),0,i.getSystemWindowInsetBottom());return i;});
        Button back=action(getString(R.string.local_import_back),"local-back",this::finish);root.addView(back);
        ScrollView scroll=new ScrollView(this);body=new LinearLayout(this);body.setOrientation(LinearLayout.VERTICAL);body.setPadding(Ui.dp(this,16),0,Ui.dp(this,16),Ui.dp(this,24));scroll.addView(body);root.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));
        body.addView(Ui.text(this,getString(R.string.local_import_title),25,Ui.TEXT,true));body.addView(Ui.text(this,getString(R.string.local_import_help),14,Ui.MUTED,false));
        body.addView(action(getString(R.string.local_import_folder),"local-folder",()->pick(FOLDER)));body.addView(action(getString(R.string.local_import_cbz),"local-cbz",()->pick(CBZ)));
        if(session.busy){
            importProgress=new ProgressBar(this,null,android.R.attr.progressBarStyleHorizontal);
            importProgressText=Ui.text(this,getString(R.string.local_import_working),14,Ui.MUTED,false);
            body.addView(importProgress);body.addView(importProgressText);
            updateImportProgress();
            if(session.importing){
                Button cancel=action(getString(R.string.local_import_cancel),"local-cancel-running",()->{});
                cancel.setEnabled(!session.cancelled);
                cancel.setOnClickListener(v->{
                    session.cancelled=true;
                    cancel.setEnabled(false);
                    importProgressText.setText(getString(R.string.local_import_cancelling));
                });
                body.addView(cancel);
            }
        }
        if(!session.error.isEmpty()){
            body.addView(Ui.text(this,getString(session.cancelled?
                    R.string.local_import_cancelled:R.string.local_import_failed),15,Ui.TEXT,true));
            if(!session.cancelled)
                body.addView(Ui.text(this,session.error,13,Ui.MUTED,false));
        }
        LocalComicStore.Preview preview=session.preview;
        if(preview!=null){body.addView(Ui.text(this,preview.title,20,Ui.TEXT,true));body.addView(Ui.text(this,getString(R.string.local_import_preview,preview.prepared.pages.size(),preview.prepared.chapters,preview.prepared.bytes/1048576.0),14,Ui.MUTED,false));body.addView(action(getString(R.string.local_import_confirm),"local-confirm",session::confirm));body.addView(action(getString(R.string.local_import_cancel),"local-cancel",()->{session.discard();render();}));}
        if(!session.actionNotice.isEmpty())
            body.addView(Ui.rawText(this,session.actionNotice,13,Ui.PRIMARY,false));
        browseCount=Ui.rawText(this,"",18,Ui.TEXT,true);
        body.addView(browseCount);
        EditText search=new EditText(this);
        search.setSingleLine(true);
        search.setHint(LocalizedText.ui(this,"搜索已导入作品","Search imported comics",
                "取込済み作品を検索"));
        Ui.styleField(search,this);
        search.setText(browseQuery);
        body.addView(search);
        LinearLayout filters=new LinearLayout(this);
        filters.setOrientation(LinearLayout.HORIZONTAL);
        browseSortButton=action("", "local-sort",this::chooseBrowseSort);
        browseReadButton=action("", "local-read-filter",this::chooseBrowseRead);
        browseSortButton.setSingleLine(true);
        browseReadButton.setSingleLine(true);
        browseSortButton.setTextSize(12);
        browseReadButton.setTextSize(12);
        filters.addView(browseSortButton,new LinearLayout.LayoutParams(0,Ui.dp(this,48),1));
        filters.addView(browseReadButton,new LinearLayout.LayoutParams(0,Ui.dp(this,48),1));
        body.addView(filters);
        updateBrowseButtons();
        browseRows=new LinearLayout(this);
        browseRows.setOrientation(LinearLayout.VERTICAL);
        body.addView(browseRows);
        search.addTextChangedListener(new TextWatcher(){
            @Override public void beforeTextChanged(CharSequence s,int start,int count,int after){}
            @Override public void onTextChanged(CharSequence s,int start,int before,int count){
                browseQuery=s.toString();
                renderBrowseRows();
            }
            @Override public void afterTextChanged(Editable value){}
        });
        renderBrowseRows();
        setContentView(root);root.requestApplyInsets();
    }

    private void updateBrowseButtons(){
        if(browseSortButton!=null)browseSortButton.setText((
                browseSort==1?LocalizedText.ui(this,"标题","Title","タイトル"):
                browseSort==2?LocalizedText.ui(this,"页数","Pages","ページ"):
                    LocalizedText.ui(this,"最近","Recent","最近"))+" ▾");
        if(browseReadButton!=null)browseReadButton.setText((
                browseRead==1?LocalizedText.ui(this,"未读","Unread","未読"):
                browseRead==2?LocalizedText.ui(this,"已读","Read","既読"):
                    LocalizedText.ui(this,"全部","All","すべて"))+" ▾");
    }

    private void chooseBrowseSort(){
        String[] choices={
            LocalizedText.ui(this,"最近导入","Recently imported","最近取り込んだ順"),
            LocalizedText.ui(this,"标题 A-Z","Title A-Z","タイトル順"),
            LocalizedText.ui(this,"页数降序","Most pages","ページ数の多い順")
        };
        new AlertDialog.Builder(this)
            .setTitle(LocalizedText.ui(this,"排序","Sort","並び替え"))
            .setSingleChoiceItems(choices,browseSort,(dialog,which)->{
                browseSort=which;
                updateBrowseButtons();
                renderBrowseRows();
                dialog.dismiss();
            }).setNegativeButton(android.R.string.cancel,null).show();
    }

    private void chooseBrowseRead(){
        String[] choices={
            LocalizedText.ui(this,"全部","All","すべて"),
            LocalizedText.ui(this,"未读","Unread","未読"),
            LocalizedText.ui(this,"已读","Read","既読")
        };
        new AlertDialog.Builder(this)
            .setTitle(LocalizedText.ui(this,"阅读状态","Reading status","閲覧状態"))
            .setSingleChoiceItems(choices,browseRead,(dialog,which)->{
                browseRead=which;
                updateBrowseButtons();
                renderBrowseRows();
                dialog.dismiss();
            }).setNegativeButton(android.R.string.cancel,null).show();
    }

    private void openImportedBook(LocalComicReaderPort.Book book,
                                  ReaderHistoryLedger.Session last){
        if(session.busy)return;
        Intent intent=new Intent(this,ReaderActivity.class);
        intent.putExtra("comicId",book.id);
        intent.putExtra("source","local");
        intent.putExtra("title",book.title);
        if(last!=null&&!last.chapterId.isEmpty()){
            ReaderProgressLedger.seedOneShotPosition(
                    this,book.id,last.chapterId,last.lastPage);
            intent.putExtra("episodeId",last.chapterId);
        }
        startActivity(intent);
    }

    private void chooseShelf(LocalComicReaderPort.Book book){
        if(session.busy)return;
        List<ShelfLedger.Shelf> choices=new ArrayList<>();
        for(ShelfLedger.Shelf shelf:ShelfStore.load(this).activeShelves()){
            boolean already=false;
            for(ShelfLedger.Item item:shelf.activeItems())
                if(item.comicId.equals(book.id)){already=true;break;}
            if(!already)choices.add(shelf);
        }
        String[] names=new String[choices.size()+1];
        names[0]=LocalizedText.ui(this,"新建书架并加入","Create shelf and add",
                "本棚を作って追加");
        for(int i=0;i<choices.size();i++)names[i+1]=choices.get(i).name;
        new AlertDialog.Builder(this)
            .setTitle(LocalizedText.ui(this,"加入书架","Add to shelf","本棚に追加"))
            .setItems(names,(dialog,which)->{
                if(which>0){
                    session.addToShelf(choices.get(which-1).id,book,null);
                    return;
                }
                EditText name=new EditText(this);
                name.setSingleLine(true);
                name.setHint(LocalizedText.ui(this,"书架名称","Shelf name","本棚の名前"));
                Ui.styleField(name,this);
                new AlertDialog.Builder(this)
                    .setTitle(LocalizedText.ui(this,"新建书架","Create shelf","本棚を作成"))
                    .setView(name)
                    .setNegativeButton(android.R.string.cancel,null)
                    .setPositiveButton(LocalizedText.ui(this,"创建并加入","Create and add",
                                    "作成して追加"),(d,w)->session.addToShelf(
                                            "",book,name.getText().toString()))
                    .show();
            }).setNegativeButton(android.R.string.cancel,null).show();
    }

    private void renderBrowseRows(){
        if(browseRows==null||browseCount==null)return;
        browseRows.removeAllViews();
        List<LocalComicReaderPort.Book> inventory=session.books;
        Map<String,ReaderHistoryLedger.Session> recent=session.recent;
        List<LocalComicReaderPort.Book> shown=LocalLibraryBrowse.visible(
                inventory,recent,browseQuery,browseSort,browseRead);
        browseCount.setText(getString(R.string.local_import_owned,inventory.size())
                +" · "+shown.size()+"/"+inventory.size());
        ReaderHistoryLedger.Session last=LocalLibraryBrowse.newest(recent);
        LocalComicReaderPort.Book recentBook=LocalLibraryBrowse.bookFor(inventory,last);
        if(recentBook!=null&&!session.busy)
            browseRows.addView(action(LocalizedText.ui(this,"继续阅读 · ",
                    "Continue reading · ","続きを読む · ")+recentBook.title,
                    "local-continue",()->openImportedBook(recentBook,last)));
        if(shown.isEmpty()&&!inventory.isEmpty())
            browseRows.addView(Ui.rawText(this,LocalizedText.ui(this,
                    "没有匹配的本地作品","No matching imported comics",
                    "一致するローカル作品はありません"),13,Ui.MUTED,false));
        int rendered=0;
        for(LocalComicReaderPort.Book book:shown){
            if(rendered++>=100)break;
            ReaderHistoryLedger.Session previous=recent.get(book.id);
            LinearLayout card=Ui.card(this);
            String meta=book.pageCount+LocalizedText.ui(this," 页"," pages"," ページ");
            if(previous!=null)meta+=LocalizedText.ui(this,
                    " · 最近第 "+(previous.lastPage+1)+" 页",
                    " · Last page "+(previous.lastPage+1),
                    " · 最後のページ "+(previous.lastPage+1));
            card.addView(Ui.rawText(this,book.title+" · "+meta,16,Ui.TEXT,true));
            card.addView(Ui.rawText(this,LocalizedText.ui(this,
                    "长按卡片可加入书架","Long-press card to add to shelf",
                    "長押しで本棚に追加"),11,Ui.MUTED,false));
            card.setOnLongClickListener(v->{chooseShelf(book);return true;});
            card.addView(action(previous==null?getString(R.string.local_import_read):
                    LocalizedText.ui(this,"继续阅读","Continue reading","続きを読む"),
                    "local-read:"+book.id,()->openImportedBook(book,previous)));
            card.addView(action(getString(R.string.local_export_title),
                    "local-export:"+book.id,()->{
                        Intent intent=new Intent(this,LocalComicExportActivity.class);
                        intent.putExtra("comicId",book.id);
                        startActivity(intent);
                    }));
            card.addView(action(getString(R.string.local_import_remove),
                    "local-remove:"+book.id,()->new AlertDialog.Builder(this)
                        .setTitle(R.string.local_import_remove)
                        .setMessage(R.string.local_import_remove_warning)
                        .setNegativeButton(android.R.string.cancel,null)
                        .setPositiveButton(R.string.local_import_remove,
                                (d,w)->session.remove(book.id)).show()));
            browseRows.addView(card);
        }
    }

    private void pick(int code){if(session.busy)return;Intent intent=new Intent(code==FOLDER?Intent.ACTION_OPEN_DOCUMENT_TREE:Intent.ACTION_OPEN_DOCUMENT);intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);intent.putExtra(Intent.EXTRA_LOCAL_ONLY,true);if(code==CBZ){intent.addCategory(Intent.CATEGORY_OPENABLE);intent.setType("*/*");}try{startActivityForResult(intent,code);}catch(ActivityNotFoundException error){session.error=getString(R.string.local_import_no_picker);render();}}
    @Override protected void onActivityResult(int request,int result,Intent data){super.onActivityResult(request,result,data);if((request==FOLDER||request==CBZ)&&result==RESULT_OK&&data!=null&&data.getData()!=null)session.select(data.getData(),request==FOLDER?"folder":"cbz");}
}
