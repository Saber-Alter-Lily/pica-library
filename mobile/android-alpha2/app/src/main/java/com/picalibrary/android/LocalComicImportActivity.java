package com.picalibrary.android;

import android.app.AlertDialog;
import android.content.*;
import android.net.Uri;
import android.os.*;
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
    static final class Session implements AutoCloseable {
        final Context context;
        final ExecutorService worker=Executors.newSingleThreadExecutor();
        final Handler main=new Handler(Looper.getMainLooper());
        volatile boolean busy,closed,cancelled;
        volatile String error="";
        volatile LocalComicStore.Preview preview;
        volatile List<LocalComicStore.Comic> comics=Collections.emptyList();
        volatile Runnable changed;
        Session(Context context){this.context=context.getApplicationContext();}
        void notifyUi(){main.post(()->{Runnable listener=changed;if(!closed&&listener!=null)listener.run();});}
        void check() throws IOException {if(closed||cancelled||Thread.currentThread().isInterrupted())throw new IOException("Import cancelled");}
        synchronized void select(Uri uri,String kind){
            if(busy||closed)return;discard();busy=true;cancelled=false;error="";notifyUi();
            worker.submit(()->{LocalComicStore.Preview next=null;try{next=LocalComicStore.prepare(context,uri,kind,this::check);synchronized(this){check();preview=next;next=null;}}catch(Exception|OutOfMemoryError e){if(!closed)error=message(e);}finally{if(next!=null)next.close();synchronized(this){busy=false;if(closed)discard();}notifyUi();}});
        }
        synchronized void confirm(){if(busy||preview==null||closed)return;busy=true;error="";notifyUi();worker.submit(()->{try{check();LocalComicStore.confirm(context,preview,this::check);preview=null;comics=LocalComicStore.list(context);try{UnifiedCatalogStore.reconcileLocalReferences(context);}catch(Exception catalogError){error=context.getString(R.string.local_import_catalog_pending);}}catch(Exception|OutOfMemoryError e){error=message(e);discard();}finally{busy=false;notifyUi();}});}
        synchronized void discard(){LocalComicStore.Preview old=preview;preview=null;if(old!=null)old.close();}
        void load(){worker.submit(()->{comics=LocalComicStore.list(context);notifyUi();});}
        synchronized void remove(String id){if(busy||closed)return;busy=true;error="";notifyUi();worker.submit(()->{try{LocalComicStore.remove(context,id);comics=LocalComicStore.list(context);}catch(Exception e){error=message(e);}finally{busy=false;notifyUi();}});}
        private static String message(Throwable error){String text=error.getMessage();return text==null||text.length()>200?"Unable to import this comic":text;}
        @Override public synchronized void close(){closed=true;cancelled=true;changed=null;worker.shutdownNow();discard();}
    }
    @Override public void onCreate(Bundle saved){super.onCreate(saved);Ui.applyWindow(this);Object retained=getLastNonConfigurationInstance();session=retained instanceof Session?(Session)retained:new Session(this);session.changed=this::render;render();session.load();}
    @Override public Object onRetainNonConfigurationInstance(){return session;}
    @Override protected void onDestroy(){session.changed=null;if(!isChangingConfigurations())session.close();super.onDestroy();}
    private Button action(String text,String tag,Runnable run){Button button=new Button(this);button.setAllCaps(false);button.setText(text);button.setTag(tag);button.setEnabled(!session.busy);button.setOnClickListener(v->run.run());return button;}
    private void render(){
        if(isFinishing()||isDestroyed())return;
        LinearLayout root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);root.setBackgroundColor(Ui.BG);root.setOnApplyWindowInsetsListener((v,i)->{v.setPadding(0,i.getSystemWindowInsetTop(),0,i.getSystemWindowInsetBottom());return i;});
        Button back=action(getString(R.string.local_import_back),"local-back",this::finish);root.addView(back);
        ScrollView scroll=new ScrollView(this);body=new LinearLayout(this);body.setOrientation(LinearLayout.VERTICAL);body.setPadding(Ui.dp(this,16),0,Ui.dp(this,16),Ui.dp(this,24));scroll.addView(body);root.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));
        body.addView(Ui.text(this,getString(R.string.local_import_title),25,Ui.TEXT,true));body.addView(Ui.text(this,getString(R.string.local_import_help),14,Ui.MUTED,false));
        body.addView(action(getString(R.string.local_import_folder),"local-folder",()->pick(FOLDER)));body.addView(action(getString(R.string.local_import_cbz),"local-cbz",()->pick(CBZ)));
        if(session.busy){ProgressBar progress=new ProgressBar(this);body.addView(progress);body.addView(Ui.text(this,getString(R.string.local_import_working),14,Ui.MUTED,false));}
        if(!session.error.isEmpty()){body.addView(Ui.text(this,getString(R.string.local_import_failed),15,Ui.TEXT,true));body.addView(Ui.text(this,session.error,13,Ui.MUTED,false));}
        LocalComicStore.Preview preview=session.preview;
        if(preview!=null){body.addView(Ui.text(this,preview.title,20,Ui.TEXT,true));body.addView(Ui.text(this,getString(R.string.local_import_preview,preview.prepared.pages.size(),preview.prepared.chapters,preview.prepared.bytes/1048576.0),14,Ui.MUTED,false));body.addView(action(getString(R.string.local_import_confirm),"local-confirm",session::confirm));body.addView(action(getString(R.string.local_import_cancel),"local-cancel",()->{session.discard();render();}));}
        body.addView(Ui.text(this,getString(R.string.local_import_owned,session.comics.size()),19,Ui.TEXT,true));int shown=0;
        for(LocalComicStore.Comic comic:session.comics){if(shown++>=100)break;LinearLayout card=Ui.card(this);card.addView(Ui.text(this,comic.title+" · "+comic.pages.size(),16,Ui.TEXT,true));card.addView(action(getString(R.string.local_import_read),"local-read:"+comic.id,()->{Intent intent=new Intent(this,ReaderActivity.class);intent.putExtra("comicId",comic.id);intent.putExtra("source","local");intent.putExtra("title",comic.title);startActivity(intent);}));card.addView(action(getString(R.string.local_import_remove),"local-remove:"+comic.id,()->new AlertDialog.Builder(this).setTitle(R.string.local_import_remove).setMessage(R.string.local_import_remove_warning).setNegativeButton(android.R.string.cancel,null).setPositiveButton(R.string.local_import_remove,(d,w)->session.remove(comic.id)).show()));body.addView(card);}
        setContentView(root);root.requestApplyInsets();
    }
    private void pick(int code){if(session.busy)return;Intent intent=new Intent(code==FOLDER?Intent.ACTION_OPEN_DOCUMENT_TREE:Intent.ACTION_OPEN_DOCUMENT);intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);intent.putExtra(Intent.EXTRA_LOCAL_ONLY,true);if(code==CBZ){intent.addCategory(Intent.CATEGORY_OPENABLE);intent.setType("*/*");}try{startActivityForResult(intent,code);}catch(ActivityNotFoundException error){session.error=getString(R.string.local_import_no_picker);render();}}
    @Override protected void onActivityResult(int request,int result,Intent data){super.onActivityResult(request,result,data);if((request==FOLDER||request==CBZ)&&result==RESULT_OK&&data!=null&&data.getData()!=null)session.select(data.getData(),request==FOLDER?"folder":"cbz");}
}
