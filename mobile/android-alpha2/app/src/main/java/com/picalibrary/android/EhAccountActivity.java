package com.picalibrary.android;

import android.app.*;
import android.content.*;
import android.net.Uri;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.widget.*;
import java.util.*;

/** E-H / ExH account management. ExH is a capability of the connected E-H session. */
public final class EhAccountActivity extends Activity {
    private LinearLayout content;private TextView accountState,exhState,feedback;private boolean busy;private int probeSerial;
    @Override public void onCreate(Bundle saved){super.onCreate(saved);Ui.applyWindow(this);renderShell();}
    @Override protected void onResume(){super.onResume();renderContent();}
    @Override protected void onDestroy(){probeSerial++;super.onDestroy();}
    private Button compact(String label,View.OnClickListener action){return Ui.button(this,label,action,true);}

    private void renderShell(){LinearLayout root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);root.setBackgroundColor(Ui.BG);root.setOnApplyWindowInsetsListener((v,i)->{v.setPadding(0,i.getSystemWindowInsetTop(),0,i.getSystemWindowInsetBottom());return i;});LinearLayout bar=new LinearLayout(this);bar.setGravity(Gravity.CENTER_VERTICAL);bar.setPadding(Ui.dp(this,8),Ui.dp(this,6),Ui.dp(this,8),Ui.dp(this,4));bar.addView(compact("‹ 返回",v->finish()));bar.addView(Ui.text(this,"E-Hentai / ExHentai",22,Ui.TEXT,true),new LinearLayout.LayoutParams(0,-2,1));root.addView(bar);ScrollView scroll=new ScrollView(this);content=new LinearLayout(this);content.setOrientation(LinearLayout.VERTICAL);content.setPadding(Ui.dp(this,14),Ui.dp(this,12),Ui.dp(this,14),Ui.dp(this,24));scroll.addView(content);root.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));setContentView(root);root.requestApplyInsets();renderContent();}
    private void renderContent(){if(content==null)return;probeSerial++;content.removeAllViews();EhAccountStore.Session session=EhAccountStore.load(this);boolean connected=session.configured();LinearLayout statusCard=Ui.card(this);accountState=Ui.text(this,connected?"已连接":"未连接",13,connected?Ui.GOOD:Ui.MUTED,true);statusCard.addView(SettingsRow.statusLine(this,"E-H 账号",accountState));exhState=Ui.text(this,connected?"检查中":"未检测",13,Ui.MUTED,true);statusCard.addView(SettingsRow.statusLine(this,"ExH",exhState));content.addView(statusCard);feedback=Ui.text(this,"",13,Ui.BAD,false);feedback.setVisibility(View.GONE);feedback.setPadding(Ui.dp(this,4),Ui.dp(this,2),Ui.dp(this,4),Ui.dp(this,8));content.addView(feedback);if(!connected){Button connect=Ui.button(this,"连接账号",v->startActivity(new Intent(this,EhSessionActivity.class)),false);content.addView(connect,new LinearLayout.LayoutParams(-1,-2));Ui.gap(content,this,8);content.addView(compact("官方账号 ▾",v->showOfficialAccountActions()),new LinearLayout.LayoutParams(-2,-2));return;}Button sync=Ui.button(this,"同步云收藏",v->syncFavorites(),false);content.addView(sync,new LinearLayout.LayoutParams(-1,-2));Ui.gap(content,this,8);LinearLayout actions=new LinearLayout(this);actions.setGravity(Gravity.CENTER_VERTICAL);actions.addView(compact("官方账号 ▾",v->showOfficialAccountActions()));Ui.gap(actions,this,8);actions.addView(compact("账号管理 ▾",v->showAccountActions()));content.addView(actions);probe();}
    private void showOfficialAccountActions(){String[] labels={"官网登录","注册账号"};new AlertDialog.Builder(this).setTitle("E-H 官方账号").setItems(labels,(d,w)->open(w==0?"https://forums.e-hentai.org/index.php?act=Login":"https://forums.e-hentai.org/index.php?act=Reg&CODE=00")).setNegativeButton("取消",null).show();}
    private void showAccountActions(){String[] labels={"更新登录会话","重新检查 ExH","清除本机会话"};new AlertDialog.Builder(this).setTitle("账号管理").setItems(labels,(d,w)->{if(w==0)startActivity(new Intent(this,EhSessionActivity.class));else if(w==1)probe();else confirmClearSession();}).setNegativeButton("取消",null).show();}
    private void confirmClearSession(){new AlertDialog.Builder(this).setTitle("清除 E-H 账号？").setMessage("只会删除本机登录会话。") .setNegativeButton("取消",null).setPositiveButton("清除",(d,w)->clearSession()).show();}
    private void syncFavorites(){if(busy)return;busy=true;showFeedback("正在同步…",Ui.MUTED);new Thread(()->{try{List<EhClient.Comic> comics=new EhClient(this).favoritesAll();UnifiedEhCatalogSync.mergeAll(this,comics);EhFavoriteStore.replaceRemote(this,comics);runOnUiThread(()->{busy=false;hideFeedback();Toast.makeText(this,"已同步 "+comics.size()+" 本",Toast.LENGTH_SHORT).show();});}catch(Exception e){runOnUiThread(()->{busy=false;showFeedback(syncError(e),Ui.BAD);});}}).start();}
    private String syncError(Exception e){String m=e.getMessage()==null?"":e.getMessage();if(m.contains("会话无效")||m.contains("已过期"))return "登录会话已过期，请更新会话。";return m.isEmpty()?"同步失败，请稍后重试。":"同步失败："+m;}
    private void probe(){if(!EhAccountStore.load(this).configured()){if(exhState!=null){exhState.setText("未检测");exhState.setTextColor(Ui.MUTED);}return;}final int id=++probeSerial;if(exhState!=null){exhState.setText("检查中");exhState.setTextColor(Ui.MUTED);}new Thread(()->{String value=new EhClient(this).probeExH();runOnUiThread(()->{if(id!=probeSerial||isDestroyed()||exhState==null)return;String label="AVAILABLE".equals(value)?"可用":"NETWORK_ERROR".equals(value)?"网络异常":"无权限";exhState.setText(label);exhState.setTextColor(SettingsRow.statusColor(label));});}).start();}
    private void clearSession(){if(busy)return;EhAccountStore.clear(this);Toast.makeText(this,"E-H 账号已清除",Toast.LENGTH_SHORT).show();renderContent();}
    private void open(String url){try{startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse(url)));}catch(Exception e){showFeedback(url.contains("Reg")?"无法打开注册页面":"无法打开登录页面",Ui.BAD);}}
    private void showFeedback(String text,int color){if(feedback==null)return;feedback.setText(text);feedback.setTextColor(color);feedback.setVisibility(View.VISIBLE);}
    private void hideFeedback(){if(feedback!=null)feedback.setVisibility(View.GONE);}
}
