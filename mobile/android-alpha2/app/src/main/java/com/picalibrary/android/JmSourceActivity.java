package com.picalibrary.android;

import android.app.AlertDialog;
import android.content.Intent;
import android.os.Bundle;
import android.text.InputType;
import android.view.View;
import android.view.inputmethod.EditorInfo;
import android.widget.*;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.*;

/** Phone-native source UI. No Desktop, recommendation or sync protocol is involved. */
public class JmSourceActivity extends LocaleAwareActivity {
    interface Client {
        JSONObject status() throws Exception;
        JSONObject login(String username,String password,boolean remember) throws Exception;
        void logout() throws Exception;
        JSONObject previewFavorites(JmClientManager.FavoritesProgress progress) throws Exception;
        int confirm(String token) throws Exception;
        JSONObject enrichFavorites(JmClientManager.EnrichmentProgress progress) throws Exception;
        JSONObject search(String query,int page) throws Exception;
        JSONObject details(String id) throws Exception;
        void merge(JSONArray rows) throws Exception;
        void cancel();
    }
    private enum Operation { IDLE, STATUS, LOGIN, LOGOUT, SCAN, IMPORT, ENRICH, SEARCH, DETAILS }
    private interface Task { Runnable run(long request) throws Exception; }
    private LinearLayout results;
    private TextView status,message,pageSummary;
    private EditText query;
    private ProgressBar progress;
    private Button login,logout,scan,confirm,cancel,enrich,search,previous,next;
    private final List<Button> detailButtons=new ArrayList<>();
    private Client client;
    private ExecutorService worker;
    private Operation operation=Operation.IDLE;
    private volatile boolean destroyed,cancelRequested;
    private boolean configured;
    private long activeRequest;
    private String previewToken="",lastQuery="";
    private int previewCount,page=1,totalPages=1,recoveryNotice;
    private JSONArray lastItems=new JSONArray();
    private AlertDialog accountDialog;

    /** Instance-scoped seams allow synthetic UI tests without a provider account or network. */
    protected Client createClient(){
        JmClientManager manager=JmClientManager.get(this);
        return new Client(){
            public JSONObject status() throws Exception{return manager.status();}
            public JSONObject login(String u,String p,boolean r) throws Exception{return manager.login(u,p,r);}
            public void logout(){manager.logout();}
            public JSONObject previewFavorites(JmClientManager.FavoritesProgress p) throws Exception{return manager.previewFavorites(p);}
            public int confirm(String token) throws Exception{return manager.confirm(token);}
            public JSONObject enrichFavorites(JmClientManager.EnrichmentProgress p) throws Exception{return manager.enrichFavorites(p);}
            public JSONObject search(String q,int p) throws Exception{return manager.search(q,p);}
            public JSONObject details(String id) throws Exception{return manager.details(id);}
            public void merge(JSONArray rows) throws Exception{manager.merge(rows,false);}
            public void cancel(){manager.cancel();}
        };
    }
    protected ExecutorService createWorker(){return Executors.newSingleThreadExecutor();}

    @Override public void onCreate(Bundle saved){
        super.onCreate(saved);Ui.applyWindow(this);client=createClient();worker=createWorker();
        LinearLayout root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);root.setBackgroundColor(Ui.BG);
        root.setOnApplyWindowInsetsListener((v,insets)->{v.setPadding(0,insets.getSystemWindowInsetTop(),0,insets.getSystemWindowInsetBottom());return insets;});
        root.addView(Ui.button(this,getString(R.string.common_back),v->finish(),true));
        ScrollView scroll=new ScrollView(this);LinearLayout content=new LinearLayout(this);content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(Ui.dp(this,14),Ui.dp(this,8),Ui.dp(this,14),Ui.dp(this,24));scroll.addView(content);root.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));
        content.addView(Ui.rawText(this,getString(R.string.jm_source_title),22,Ui.TEXT,true));SourceAccessUi.entry(this,content);
        status=Ui.rawText(this,getString(R.string.jm_source_status_loading),13,Ui.MUTED,false);status.setTag("jm.status");content.addView(status);
        content.addView(Ui.rawText(this,getString(R.string.jm_source_help),12,Ui.MUTED,false));
        login=button(content,"jm.login",R.string.jm_source_login,v->loginDialog());
        logout=button(content,"jm.logout",R.string.jm_source_logout,v->logoutDialog());
        scan=button(content,"jm.scan",R.string.jm_source_scan,v->scanFavorites());
        confirm=button(content,"jm.confirm",R.string.jm_source_confirm,v->importFavorites());
        enrich=button(content,"jm.enrich",R.string.jm_source_enrich,v->enrichFavorites());
        progress=new ProgressBar(this);progress.setIndeterminate(true);content.addView(progress);
        cancel=button(content,"jm.cancel",R.string.jm_source_cancel,v->cancelOperation());
        query=new EditText(this);query.setTag("jm.query");query.setSingleLine(true);query.setHint(R.string.jm_source_query_hint);
        query.setContentDescription(getString(R.string.jm_source_query_hint));query.setImeOptions(EditorInfo.IME_ACTION_SEARCH);Ui.styleField(query,this);content.addView(query);
        search=button(content,"jm.search",R.string.jm_source_search,v->submitSearch());
        query.setOnEditorActionListener((v,action,event)->{if(action==EditorInfo.IME_ACTION_SEARCH||action==EditorInfo.IME_ACTION_DONE){submitSearch();return true;}return false;});
        message=Ui.rawText(this,"",13,Ui.MUTED,false);message.setTag("jm.message");message.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);content.addView(message);
        pageSummary=Ui.rawText(this,"",13,Ui.MUTED,false);pageSummary.setTag("jm.page");content.addView(pageSummary);
        results=new LinearLayout(this);results.setOrientation(LinearLayout.VERTICAL);results.setTag("jm.results");content.addView(results);
        LinearLayout pages=new LinearLayout(this);
        previous=Ui.button(this,getString(R.string.jm_source_previous),v->loadPage(lastQuery,page-1),true);previous.setTag("jm.previous");
        next=Ui.button(this,getString(R.string.jm_source_next),v->loadPage(lastQuery,page+1),true);next.setTag("jm.next");
        pages.addView(previous,new LinearLayout.LayoutParams(0,-2,1));pages.addView(next,new LinearLayout.LayoutParams(0,-2,1));content.addView(pages);
        setContentView(root);root.requestApplyInsets();
        restoreSearch(saved);renderResults();
        start(Operation.STATUS,R.string.jm_source_status_loading,request->{JSONObject identity=client.status();return ()->{showIdentity(identity);showMessage(recoveryNotice!=0?recoveryNotice:R.string.jm_source_ready);};});
    }

    private Button button(LinearLayout parent,String tag,int text,View.OnClickListener action){
        Button result=Ui.button(this,getString(text),action,true);result.setTag(tag);parent.addView(result);return result;
    }
    private boolean idle(){return !destroyed&&operation==Operation.IDLE;}
    private boolean cancellable(){return operation==Operation.SCAN||operation==Operation.ENRICH;}
    private void updateButtons(){
        boolean ready=idle();
        for(Button b:new Button[]{login,logout,scan,confirm,enrich,search})b.setEnabled(ready);
        query.setEnabled(ready);for(Button b:detailButtons)b.setEnabled(ready);
        previous.setEnabled(ready&&page>1);next.setEnabled(ready&&page<totalPages);
        confirm.setVisibility(previewToken.isEmpty()?View.GONE:View.VISIBLE);
        confirm.setText(previewToken.isEmpty()?getString(R.string.jm_source_confirm):getString(R.string.jm_source_confirm_count,previewCount));
        progress.setVisibility(ready?View.GONE:View.VISIBLE);
        cancel.setVisibility(cancellable()?View.VISIBLE:View.GONE);cancel.setEnabled(cancellable()&&!cancelRequested);
    }
    private void clearPreview(){previewToken="";previewCount=0;}
    private void showMessage(int resource,Object... args){message.setText(getString(resource,args));}
    private void showIdentity(JSONObject identity){
        configured=identity!=null&&identity.optBoolean("configured");
        status.setText(identity!=null&&!identity.optBoolean("enabled",true)?getString(R.string.source_disabled):identity==null?getString(R.string.jm_source_status_unknown):configured?getString(R.string.jm_source_status_signed_in,identity.optString("username")):getString(R.string.jm_source_status_signed_out));
    }
    private void postProgress(long request,int resource,Object... args){
        runOnUiThread(()->{if(!destroyed&&request==activeRequest&&!cancelRequested)showMessage(resource,args);});
    }
    private void start(Operation nextOperation,int messageResource,Task task){
        if(!idle())return;
        if(nextOperation!=Operation.STATUS&&nextOperation!=Operation.LOGOUT&&!SourceAccessUi.require(this,"jm"))return;
        operation=nextOperation;cancelRequested=false;long request=++activeRequest;showMessage(messageResource);updateButtons();
        worker.execute(()->{
            Runnable success=null;Exception failure=null;JSONObject failedIdentity=null;
            try{requireActive();success=task.run(request);}catch(Exception error){failure=error;if(nextOperation==Operation.LOGIN||nextOperation==Operation.LOGOUT){try{failedIdentity=client.status();}catch(Exception ignored){/* never reuse a stale account label */}}}
            final Runnable completed=success;final Exception error=failure;final JSONObject identity=failedIdentity;
            runOnUiThread(()->{
                if(destroyed||request!=activeRequest)return;
                if(cancelRequested){clearPreview();showMessage(nextOperation==Operation.ENRICH?R.string.jm_source_enrich_cancelled:R.string.jm_source_scan_cancelled);}
                else if(error!=null){
                    if(nextOperation==Operation.LOGIN||nextOperation==Operation.LOGOUT)showIdentity(identity);
                    if(nextOperation==Operation.STATUS)showIdentity(null);
                    if(nextOperation==Operation.SCAN||nextOperation==Operation.IMPORT)clearPreview();
                    showMessage(error instanceof com.picalibrary.android.sources.SourceAccessPolicy.Disabled?R.string.source_disabled:errorResource(nextOperation));
                }else if(completed!=null)completed.run();
                operation=Operation.IDLE;updateButtons();
            });
        });
    }
    private void requireActive(){if(destroyed||cancelRequested||Thread.currentThread().isInterrupted())throw new java.util.concurrent.CancellationException();}
    private static int errorResource(Operation operation){
        switch(operation){
            case STATUS:return R.string.jm_source_status_failed;
            case LOGIN:return R.string.jm_source_login_failed;
            case LOGOUT:return R.string.jm_source_logout_failed;
            case SCAN:return R.string.jm_source_scan_failed;
            case IMPORT:return R.string.jm_source_import_failed;
            case ENRICH:return R.string.jm_source_enrich_failed;
            case SEARCH:return R.string.jm_source_search_failed;
            default:return R.string.jm_source_details_failed;
        }
    }
    private void cancelOperation(){
        if(!cancellable()||cancelRequested||destroyed)return;
        cancelRequested=true;clearPreview();client.cancel();showMessage(R.string.jm_source_cancel_wait);updateButtons();
    }
    private void scanFavorites(){
        if(!idle())return;
        if(!configured){showMessage(R.string.jm_source_login_required);return;}
        clearPreview();
        start(Operation.SCAN,R.string.jm_source_scan_loading,request->{
            JSONObject ready=client.previewFavorites((p,pages,count,total)->{requireActive();postProgress(request,R.string.jm_source_scan_progress,p,pages,count,total);});
            String token=ready.getString("token");int count=ready.getInt("count");
            if(token.isEmpty()||count<0||count>10000)throw new IllegalStateException("Invalid preview");
            return ()->{if(count==0){clearPreview();showMessage(R.string.jm_source_scan_empty);}else{previewToken=token;previewCount=count;showMessage(R.string.jm_source_scan_ready,count);}};
        });
    }
    private void importFavorites(){
        if(!idle()||previewToken.isEmpty())return;
        String token=previewToken;clearPreview();
        start(Operation.IMPORT,R.string.jm_source_import_loading,request->{int count=client.confirm(token);return ()->showMessage(R.string.jm_source_import_complete,count);});
    }
    private void enrichFavorites(){
        if(!idle())return;
        start(Operation.ENRICH,R.string.jm_source_enrich_loading,request->{
            JSONObject result=client.enrichFavorites((done,total,updated,failed)->{requireActive();postProgress(request,R.string.jm_source_enrich_progress,done,total,updated,failed);});
            return ()->showMessage(R.string.jm_source_enrich_complete,result.optInt("updated"),result.optInt("failed"),result.optInt("remaining"));
        });
    }

    private void loginDialog(){
        if(!idle())return;
        LinearLayout form=new LinearLayout(this);form.setOrientation(LinearLayout.VERTICAL);form.setPadding(Ui.dp(this,18),0,Ui.dp(this,18),0);
        EditText username=new EditText(this),password=new EditText(this);username.setTag("jm.username");password.setTag("jm.password");
        username.setSingleLine(true);username.setHint(R.string.jm_source_username);Ui.styleField(username,this);
        password.setSingleLine(true);password.setHint(R.string.jm_source_password);password.setInputType(InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_VARIATION_PASSWORD);
        password.setSaveEnabled(false);password.setFreezesText(false);Ui.styleField(password,this);
        CheckBox remember=new CheckBox(this);remember.setTag("jm.remember");remember.setText(R.string.jm_source_remember);remember.setTextColor(Ui.TEXT);
        form.addView(username);form.addView(password);form.addView(remember);
        AlertDialog dialog=new AlertDialog.Builder(this).setTitle(R.string.jm_source_login_title).setView(form).setNegativeButton(R.string.jm_source_dismiss,null).setPositiveButton(R.string.jm_source_sign_in,null).create();
        accountDialog=dialog;
        dialog.setOnDismissListener(d->{password.setText("");if(accountDialog==dialog)accountDialog=null;});
        dialog.setOnShowListener(d->dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v->{
            if(!idle())return;
            String account=username.getText().toString().trim(),secret=password.getText().toString();boolean saved=remember.isChecked();
            if(account.isEmpty()||secret.isEmpty()){password.setError(getString(R.string.jm_source_credentials_required));return;}
            password.setText("");dialog.dismiss();clearPreview();
            start(Operation.LOGIN,R.string.jm_source_login_loading,request->{JSONObject identity=client.login(account,secret,saved);return ()->{showIdentity(identity);showMessage(saved?R.string.jm_source_login_remembered:R.string.jm_source_login_ephemeral);};});
        }));dialog.show();
    }
    private void logoutDialog(){
        if(!idle())return;
        AlertDialog dialog=new AlertDialog.Builder(this).setTitle(R.string.jm_source_logout_title).setMessage(R.string.jm_source_logout_help)
                .setNegativeButton(R.string.jm_source_dismiss,null).setPositiveButton(R.string.jm_source_clear,(d,w)->{
                    if(!idle())return;clearPreview();start(Operation.LOGOUT,R.string.jm_source_logout_loading,request->{client.logout();JSONObject identity=client.status();return ()->{showIdentity(identity);showMessage(R.string.jm_source_logout_complete);};});
                }).create();
        accountDialog=dialog;dialog.setOnDismissListener(d->{if(accountDialog==dialog)accountDialog=null;});dialog.show();
    }
    private void submitSearch(){
        if(!idle())return;String text=query.getText().toString().trim();
        if(text.length()>160){query.setError(getString(R.string.jm_source_query_too_long));return;}
        query.setError(null);loadPage(text,1);
    }
    private void loadPage(String text,int requested){
        if(!idle()||requested<1||requested>10000)return;
        start(Operation.SEARCH,R.string.jm_source_search_loading,request->{
            JSONObject response=client.search(text,requested);JSONArray rows=response.getJSONArray("items");
            JSONArray display=displayItems(rows);int current=response.getInt("page"),pages=response.getInt("pages");
            if(current!=requested||pages<0||pages>10000||(rows.length()>0&&pages<current))throw new IllegalStateException("Invalid pagination");
            client.merge(rows);
            return ()->{lastQuery=text;page=current;totalPages=Math.max(current,pages);lastItems=display;renderResults();showMessage(rows.length()==0?R.string.jm_source_search_empty:R.string.jm_source_search_complete);};
        });
    }
    /** Save only bounded visible metadata, never account data, secrets or import tokens. */
    private static JSONArray displayItems(JSONArray rows) throws Exception {
        if(rows.length()>200)throw new IllegalArgumentException("Oversized search page");
        JSONArray display=new JSONArray();
        for(int i=0;i<rows.length();i++){
            JSONObject row=rows.getJSONObject(i);String id=row.getString("comicId"),title=row.optString("title"),author=row.optString("author");
            if(!id.matches("jm:[1-9][0-9]{0,14}")||title.length()>1000||author.length()>1000)throw new IllegalArgumentException("Invalid search item");
            display.put(new JSONObject().put("comicId",id).put("title",title).put("author",author));
        }
        if(display.toString().length()>120000)throw new IllegalArgumentException("Oversized search state");
        return display;
    }
    private void renderResults(){
        results.removeAllViews();detailButtons.clear();
        for(int i=0;i<lastItems.length();i++){
            JSONObject row=lastItems.optJSONObject(i);if(row==null)continue;
            LinearLayout card=Ui.card(this);String title=row.optString("title"),author=row.optString("author");
            card.addView(Ui.rawText(this,title.isEmpty()?getString(R.string.jm_source_untitled):title,16,Ui.TEXT,true));
            card.addView(Ui.rawText(this,author.isEmpty()?getString(R.string.jm_source_author_unknown):author,12,Ui.MUTED,false));
            Button detail=Ui.button(this,getString(R.string.jm_source_details),v->openDetails(row.optString("comicId")),true);detail.setTag("jm.detail:"+row.optString("comicId"));detailButtons.add(detail);card.addView(detail);results.addView(card);
        }
        pageSummary.setText(lastItems.length()==0?"":getString(R.string.jm_source_page,page,totalPages,lastItems.length()));
    }
    private void openDetails(String id){
        start(Operation.DETAILS,R.string.jm_source_details_loading,request->{JSONObject comic=client.details(id);client.merge(new JSONArray().put(comic));return ()->{
            Intent intent=new Intent(this,UnifiedComicDetailActivity.class);intent.putExtra("comicId",id);intent.putExtra("title",comic.optString("title"));intent.putExtra("author",comic.optString("author"));startActivity(intent);showMessage(R.string.jm_source_details_opened);
        };});
    }
    private void restoreSearch(Bundle saved){
        if(saved==null)return;
        try{
            String input=saved.getString("jm.query",""),submitted=saved.getString("jm.lastQuery","");
            int current=saved.getInt("jm.page",1),pages=saved.getInt("jm.pages",1);
            if(input.length()>160||submitted.length()>160||current<1||pages<current||pages>10000)throw new IllegalArgumentException("Invalid saved search");
            lastItems=displayItems(new JSONArray(saved.getString("jm.items","[]")));query.setText(input);lastQuery=submitted;page=current;totalPages=pages;
        }catch(Exception ignored){lastItems=new JSONArray();lastQuery="";page=totalPages=1;}
        String interrupted=saved.getString("jm.interrupted","");
        if("SCAN".equals(interrupted)||saved.getBoolean("jm.previewDiscarded"))recoveryNotice=R.string.jm_source_scan_interrupted;
        else if("ENRICH".equals(interrupted))recoveryNotice=R.string.jm_source_enrich_interrupted;
        else if("IMPORT".equals(interrupted))recoveryNotice=R.string.jm_source_import_interrupted;
        else if(!interrupted.isEmpty()&&!"IDLE".equals(interrupted)&&!"STATUS".equals(interrupted))recoveryNotice=R.string.jm_source_operation_interrupted;
    }
    @Override protected void onSaveInstanceState(Bundle out){
        super.onSaveInstanceState(out);
        String input=query.getText().toString();out.putString("jm.query",input.substring(0,Math.min(input.length(),160)));
        out.putString("jm.lastQuery",lastQuery);out.putInt("jm.page",page);out.putInt("jm.pages",totalPages);out.putString("jm.items",lastItems.toString());
        out.putString("jm.interrupted",operation.name());out.putBoolean("jm.previewDiscarded",!previewToken.isEmpty());
    }
    @Override protected void onDestroy(){
        destroyed=true;activeRequest++;if(cancellable()||!previewToken.isEmpty())client.cancel();clearPreview();
        if(accountDialog!=null)accountDialog.dismiss();if(worker!=null)worker.shutdownNow();super.onDestroy();
    }
}
