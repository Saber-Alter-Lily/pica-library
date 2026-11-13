package com.picalibrary.android;

import android.content.*;
import android.net.Uri;
import android.os.*;
import android.widget.*;
import com.picalibrary.android.local.LocalComicExporter;
import java.io.IOException;
import java.util.concurrent.*;

/** Explicit create-document UI. Exported CBZ contains pages only, not a complete personal-state backup. */
public class LocalComicExportActivity extends LocaleAwareActivity {
    private static final int CREATE_CBZ=8143;
    private Session session;
    static final class Session implements AutoCloseable {
        final Context context;
        final String comicId;
        final ExecutorService worker=Executors.newSingleThreadExecutor();
        final Handler main=new Handler(Looper.getMainLooper());
        volatile boolean busy,picking,closed,cancelled,loaded;
        volatile int message;
        volatile String title="";
        volatile int pages;
        volatile LocalComicExporter.Result result;
        volatile Runnable changed;
        Session(Context context,String comicId){this.context=context.getApplicationContext();this.comicId=comicId;}
        void notifyUi(){main.post(()->{Runnable listener=changed;if(!closed&&listener!=null)listener.run();});}
        void check() throws IOException {if(closed||cancelled||Thread.currentThread().isInterrupted())throw new IOException("Export cancelled");}
        synchronized void load(){if(loaded||closed)return;loaded=true;worker.submit(()->{try{LocalComicStore.Comic comic=LocalComicStore.read(context,comicId);if(comic==null)throw new IOException();title=comic.title;pages=comic.pages.size();}catch(Exception e){message=R.string.local_export_unavailable;}finally{notifyUi();}});}
        synchronized void export(Uri destination){
            picking=false;if(busy||closed)return;busy=true;cancelled=false;message=0;result=null;notifyUi();
            worker.submit(()->{
                try(LocalComicExports.Stage stage=LocalComicExports.prepare(context,comicId,this::check)) {
                    check();LocalComicExports.copyToDocument(context,stage,destination,this::check);result=stage.result;
                    message=R.string.local_export_done;
                }catch(Exception|OutOfMemoryError error){message=error instanceof LocalComicStore.ExportBusyException?R.string.local_export_busy:cancelled||closed?R.string.local_export_cancelled:R.string.local_export_failed;}
                finally{busy=false;notifyUi();}
            });
        }
        synchronized void cancel(){cancelled=true;if(!busy){picking=false;message=R.string.local_export_cancelled;}notifyUi();}
        @Override public synchronized void close(){closed=true;cancelled=true;changed=null;worker.shutdownNow();}
    }
    @Override public void onCreate(Bundle saved){
        super.onCreate(saved);Ui.applyWindow(this);
        Object retained=getLastNonConfigurationInstance();String id=getIntent().getStringExtra("comicId");
        session=retained instanceof Session?(Session)retained:new Session(this,id);session.changed=this::render;render();session.load();
    }
    @Override public Object onRetainNonConfigurationInstance(){return session;}
    @Override protected void onDestroy(){session.changed=null;if(!isChangingConfigurations())session.close();super.onDestroy();}
    private Button button(LinearLayout root,int label,String tag,Runnable action,boolean enabled){Button b=new Button(this);b.setAllCaps(false);b.setText(label);b.setTag(tag);b.setEnabled(enabled);b.setOnClickListener(v->action.run());root.addView(b);return b;}
    private void render(){
        if(isFinishing()||isDestroyed())return;
        LinearLayout root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);root.setBackgroundColor(Ui.BG);
        root.setOnApplyWindowInsetsListener((v,i)->{v.setPadding(0,i.getSystemWindowInsetTop(),0,i.getSystemWindowInsetBottom());return i;});
        button(root,R.string.local_import_back,"local-export-back",this::finish,true);
        ScrollView scroll=new ScrollView(this);LinearLayout body=new LinearLayout(this);body.setOrientation(LinearLayout.VERTICAL);body.setPadding(Ui.dp(this,16),Ui.dp(this,8),Ui.dp(this,16),Ui.dp(this,24));scroll.addView(body);root.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));
        body.addView(Ui.text(this,getString(R.string.local_export_title),25,Ui.TEXT,true));
        body.addView(Ui.text(this,getString(R.string.local_export_help),14,Ui.MUTED,false));
        if(session.pages>0)body.addView(Ui.text(this,session.title+" · "+session.pages,18,Ui.TEXT,true));
        button(body,R.string.local_export_choose,"local-export-choose",this::choose,!session.busy&&!session.picking&&session.pages>0);
        if(session.busy){body.addView(new ProgressBar(this));body.addView(Ui.text(this,getString(R.string.local_export_working),14,Ui.MUTED,false));button(body,R.string.local_export_cancel,"local-export-cancel",session::cancel,true);}
        if(session.message!=0)body.addView(Ui.text(this,getString(session.message),14,Ui.TEXT,false));
        if(session.result!=null)body.addView(Ui.text(this,getString(R.string.local_export_receipt,session.result.pages,session.result.chapters,session.result.archiveBytes/1048576.0)+"\nSHA-256: "+session.result.sha256,13,Ui.MUTED,false));
        setContentView(root);root.requestApplyInsets();
    }
    private void choose(){
        if(session.busy||session.picking||session.pages<1)return;
        session.result=null;session.message=0;
        Intent intent=new Intent(Intent.ACTION_CREATE_DOCUMENT);intent.addCategory(Intent.CATEGORY_OPENABLE);intent.setType("application/vnd.comicbook+zip");intent.putExtra(Intent.EXTRA_TITLE,LocalComicExports.filename(session.title));intent.putExtra(Intent.EXTRA_LOCAL_ONLY,true);intent.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        session.picking=true;
        try{startActivityForResult(intent,CREATE_CBZ);}catch(ActivityNotFoundException error){session.picking=false;session.message=R.string.local_import_no_picker;}render();
    }
    @Override protected void onActivityResult(int request,int result,Intent data){super.onActivityResult(request,result,data);if(request!=CREATE_CBZ||!session.picking)return;session.picking=false;if(result==RESULT_OK&&data!=null&&data.getData()!=null)session.export(data.getData());else{session.message=R.string.local_export_picker_cancelled;render();}}
}
