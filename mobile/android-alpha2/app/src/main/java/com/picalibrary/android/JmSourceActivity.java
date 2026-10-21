package com.picalibrary.android;

import android.app.AlertDialog;
import android.content.Intent;
import android.os.Bundle;
import android.text.InputType;
import android.widget.*;
import java.util.concurrent.*;
import org.json.*;

/** Small native source screen using the common catalog and Reader. No Desktop required. */
public final class JmSourceActivity extends LocaleAwareActivity {
    private LinearLayout content,results;private TextView status,message;private EditText query;
    private Button login,scan,confirm,cancel,search,previous,next;private String previewToken="",lastQuery="";private int page=1,totalPages=1;
    private final ExecutorService worker=Executors.newSingleThreadExecutor();private boolean destroyed,busy;private JmClientManager client;
    private interface Task {void run() throws Exception;}
    @Override public void onCreate(Bundle saved){
        super.onCreate(saved);Ui.applyWindow(this);client=JmClientManager.get(this);
        LinearLayout root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);root.setBackgroundColor(Ui.BG);
        root.setOnApplyWindowInsetsListener((v,insets)->{v.setPadding(0,insets.getSystemWindowInsetTop(),0,insets.getSystemWindowInsetBottom());return insets;});
        root.addView(Ui.button(this,"‹ 返回",v->finish(),true));ScrollView scroll=new ScrollView(this);content=new LinearLayout(this);content.setOrientation(LinearLayout.VERTICAL);content.setPadding(Ui.dp(this,14),Ui.dp(this,8),Ui.dp(this,14),Ui.dp(this,24));scroll.addView(content);root.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));setContentView(root);root.requestApplyInsets();
        content.addView(Ui.text(this,"JM 来源",22,Ui.TEXT,true));status=Ui.text(this,"正在读取本机登录状态…",13,Ui.MUTED,false);content.addView(status);
        content.addView(Ui.text(this,"直接由手机访问此来源。导入收藏只添加本地收藏依据，不会创建 Like 或修改云端收藏。",12,Ui.MUTED,false));
        login=Ui.button(this,"登录 / 切换 JM 账号",v->loginDialog(),true);content.addView(login);
        content.addView(Ui.button(this,"清除本机 JM 登录",v->new AlertDialog.Builder(this).setTitle("清除本机登录？").setMessage("已导入的本地收藏和阅读记录会保留。").setNegativeButton("取消",null).setPositiveButton("清除",(d,w)->run(()->{client.logout();previewToken="";showStatus();showMessage("本机 JM 登录已清除");})).show(),true));
        scan=Ui.button(this,"扫描 JM 收藏",v->run(()->{previewToken="";showMessage("正在逐页读取收藏，完成前不会导入…");JSONObject ready=client.previewFavorites();previewToken=ready.getString("token");int count=ready.getInt("count");runOnUiThread(()->{if(!destroyed)confirm.setText("确认导入 "+count+" 本收藏");});showMessage("扫描完整，可以确认导入；重复导入不会重复计数。");}),true);content.addView(scan);
        confirm=Ui.button(this,"确认导入收藏",v->run(()->{int count=client.confirm(previewToken);previewToken="";showMessage("已导入 "+count+" 本收藏，可在书库和推荐画像查看。");}),false);confirm.setVisibility(android.view.View.GONE);content.addView(confirm);
        cancel=Ui.button(this,"取消扫描",v->{client.cancel();previewToken="";showMessage("已请求取消，等待当前请求结束…");},true);content.addView(cancel);
        content.addView(Ui.button(this,"补全收藏资料 · 每批最多 20 本",v->run(()->{showMessage("正在从作品详情补全标签，可取消，已完成的资料会保留…");JSONObject result=client.enrichFavorites();showMessage("已补全 "+result.optInt("updated")+" 本，失败 "+result.optInt("failed")+" 本，剩余 "+result.optInt("remaining")+" 本。");}),true));
        query=new EditText(this);query.setSingleLine(true);query.setHint("搜索 JM 漫画、作者或标签");content.addView(query);
        search=Ui.button(this,"搜索",v->{lastQuery=query.getText().toString().trim();loadPage(1);},false);content.addView(search);
        query.setOnEditorActionListener((v,action,event)->{if(action==android.view.inputmethod.EditorInfo.IME_ACTION_SEARCH||action==android.view.inputmethod.EditorInfo.IME_ACTION_DONE){lastQuery=query.getText().toString().trim();loadPage(1);return true;}return false;});
        message=Ui.text(this,"",13,Ui.MUTED,false);content.addView(message);results=new LinearLayout(this);results.setOrientation(LinearLayout.VERTICAL);content.addView(results);
        LinearLayout pages=new LinearLayout(this);previous=Ui.button(this,"上一页",v->loadPage(page-1),true);next=Ui.button(this,"下一页",v->loadPage(page+1),true);pages.addView(previous,new LinearLayout.LayoutParams(0,-2,1));pages.addView(next,new LinearLayout.LayoutParams(0,-2,1));content.addView(pages);updateButtons();run(this::showStatus);
    }
    private void updateButtons(){if(login==null)return;login.setEnabled(!busy);scan.setEnabled(!busy);confirm.setEnabled(!busy);search.setEnabled(!busy);previous.setEnabled(!busy&&page>1);next.setEnabled(!busy&&page<totalPages);confirm.setVisibility(previewToken.isEmpty()?android.view.View.GONE:android.view.View.VISIBLE);cancel.setVisibility(busy?android.view.View.VISIBLE:android.view.View.GONE);}
    private void showMessage(String text){runOnUiThread(()->{if(!destroyed)message.setText(text);});}
    private void showStatus() throws Exception {JSONObject state=client.status();String text=state.optBoolean("configured")?"本机已登录："+state.optString("username"):"本机尚未登录";runOnUiThread(()->{if(!destroyed)status.setText(text);});}
    private void run(Task task){if(busy||destroyed)return;busy=true;updateButtons();worker.submit(()->{try{task.run();}catch(Exception error){showMessage("JM 操作未完成。请检查网络、登录状态后重试；收藏未完整扫描时不会导入。");}finally{runOnUiThread(()->{if(!destroyed){busy=false;updateButtons();}});}});}
    private void loginDialog(){if(busy)return;LinearLayout form=new LinearLayout(this);form.setOrientation(LinearLayout.VERTICAL);form.setPadding(Ui.dp(this,18),0,Ui.dp(this,18),0);EditText username=new EditText(this),password=new EditText(this);username.setSingleLine(true);username.setHint("JM 用户名");password.setSingleLine(true);password.setHint("密码");password.setInputType(InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_VARIATION_PASSWORD);CheckBox remember=new CheckBox(this);remember.setText("用本机安全存储记住登录");form.addView(username);form.addView(password);form.addView(remember);AlertDialog dialog=new AlertDialog.Builder(this).setTitle("登录本人 JM 账号").setView(form).setNegativeButton("取消",null).setPositiveButton("登录",null).create();dialog.setOnShowListener(d->dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v->{String account=username.getText().toString().trim(),secret=password.getText().toString();if(account.isEmpty()||secret.isEmpty()){password.setError("请填写用户名和密码");return;}password.setText("");dialog.dismiss();run(()->{client.login(account,secret,remember.isChecked());previewToken="";showStatus();showMessage(remember.isChecked()?"登录成功，本机凭据已加密保存。":"登录成功，会话仅保留至本次进程结束。");});}));dialog.show();}
    private void loadPage(int requested){if(requested<1||busy)return;run(()->{showMessage("正在搜索…");JSONObject response=client.search(lastQuery,requested);JSONArray rows=response.optJSONArray("items");if(rows==null)rows=new JSONArray();client.merge(rows,false);page=response.optInt("page",requested);totalPages=Math.max(1,response.optInt("pages",1));final JSONArray items=rows;runOnUiThread(()->{if(destroyed)return;results.removeAllViews();for(int i=0;i<items.length();i++){JSONObject row=items.optJSONObject(i);if(row==null)continue;LinearLayout card=Ui.card(this);card.addView(Ui.text(this,row.optString("title"),16,Ui.TEXT,true));card.addView(Ui.text(this,row.optString("author",""),12,Ui.MUTED,false));card.addView(Ui.button(this,"详情 / 阅读",v->openDetails(row.optString("comicId")),true));results.addView(card);}message.setText(items.length()==0?"没有匹配作品":"第 "+page+" / "+totalPages+" 页 · "+items.length()+" 本");});});}
    private void openDetails(String id){run(()->{JSONObject comic=client.details(id);client.merge(new JSONArray().put(comic),false);JSONArray chapters=client.episodes(id);runOnUiThread(()->{if(destroyed)return;new AlertDialog.Builder(this).setTitle(comic.optString("title")).setMessage(comic.optString("author")+"\n"+comic.optInt("pagesCount",0)+" 页\n"+comic.optString("description")).setNegativeButton("关闭",null).setPositiveButton("在线阅读",(d,w)->{if(chapters.length()==0){showMessage("该作品没有可读章节");return;}String[] labels=new String[chapters.length()];for(int i=0;i<labels.length;i++)labels[i]=chapters.optJSONObject(i).optString("title","章节");new AlertDialog.Builder(this).setTitle("选择章节").setItems(labels,(chooser,index)->{Intent intent=new Intent(this,ReaderActivity.class);intent.putExtra("comicId",id);intent.putExtra("title",comic.optString("title"));intent.putExtra("episodeId",chapters.optJSONObject(index).optString("id"));intent.putExtra("source","jm");startActivity(intent);}).show();}).show();});});}
    @Override protected void onDestroy(){destroyed=true;client.cancel();worker.shutdownNow();super.onDestroy();}
}
