package com.picalibrary.android;

import android.app.*;
import android.content.*;
import android.net.Uri;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.widget.*;
import java.util.*;

/** E-H account management. ExH is a monitored optional capability of the same account/session. */
public final class EhAccountActivity extends LocaleAwareActivity {
    private LinearLayout content;private TextView accountState,exhState,feedback;private boolean busy;private int probeSerial,desktopSerial;
    @Override public void onCreate(Bundle saved){super.onCreate(saved);Ui.applyWindow(this);renderShell();}
    @Override protected void onResume(){super.onResume();renderContent();refreshDesktopAccountState();}
    @Override protected void onDestroy(){probeSerial++;desktopSerial++;super.onDestroy();}
    private Button compact(String label,View.OnClickListener action){return Ui.button(this,label,action,true);}

    private void renderShell(){LinearLayout root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);root.setBackgroundColor(Ui.BG);root.setOnApplyWindowInsetsListener((v,i)->{v.setPadding(0,i.getSystemWindowInsetTop(),0,i.getSystemWindowInsetBottom());return i;});LinearLayout bar=new LinearLayout(this);bar.setGravity(Gravity.CENTER_VERTICAL);bar.setPadding(Ui.dp(this,8),Ui.dp(this,6),Ui.dp(this,8),Ui.dp(this,4));bar.addView(compact("‹ 返回",v->finish()));bar.addView(Ui.text(this,"E-Hentai / ExHentai",22,Ui.TEXT,true),new LinearLayout.LayoutParams(0,-2,1));root.addView(bar);ScrollView scroll=new ScrollView(this);content=new LinearLayout(this);content.setOrientation(LinearLayout.VERTICAL);content.setPadding(Ui.dp(this,14),Ui.dp(this,12),Ui.dp(this,14),Ui.dp(this,24));scroll.addView(content);root.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));setContentView(root);root.requestApplyInsets();renderContent();}
    private void renderContent(){
        if(content==null)return;
        probeSerial++;
        content.removeAllViews();
        EhAccountStore.Session session=EhAccountStore.load(this);
        boolean local=session.configured();
        boolean desktop=BridgeStore.paired(this)&&DesktopAccountStatusStore.load(this).ehConfigured;
        boolean available=local||desktop;

        LinearLayout statusCard=SettingsRow.panel(this,null);
        String accountLabel=local?"已登录（本机）":desktop?"已由 Desktop 连接":"未登录";
        accountState=Ui.text(
            this,
            accountLabel,
            13,
            SettingsRow.statusColor(available?"已登录":"未登录"),
            true
        );
        statusCard.addView(SettingsRow.statusLine(this,"E-H 账号",accountState));
        EhCapabilityStore.Snapshot capability=EhCapabilityStore.load(this);
        exhState=Ui.text(this,capability.label(),13,statusColor(capability),true);
        statusCard.addView(SettingsRow.statusLine(this,"ExH 扩展",exhState));
        content.addView(statusCard);

        feedback=Ui.text(this,"",13,Ui.BAD,false);
        feedback.setVisibility(View.GONE);
        feedback.setPadding(Ui.dp(this,4),Ui.dp(this,2),Ui.dp(this,4),Ui.dp(this,8));
        content.addView(feedback);

        if(!available){
            Button connect=Ui.button(this,"网页登录",v->startActivity(new Intent(this,EhWebLoginActivity.class)),false);
            content.addView(connect,new LinearLayout.LayoutParams(-1,-2));
            Ui.gap(content,this,8);
            content.addView(compact("其他方式 ▾",v->showDisconnectedActions()),new LinearLayout.LayoutParams(-2,-2));
            return;
        }

        Button sync=Ui.button(this,"同步云收藏",v->syncFavorites(),false);
        content.addView(sync,new LinearLayout.LayoutParams(-1,-2));
        Ui.gap(content,this,8);

        if(desktop&&!local){
            TextView note=Ui.text(
                this,
                "电脑在线并保持配对时，手机会通过 Desktop 使用 E-H 账号能力和 ExH，不会复制 Cookie 或要求重复登录。电脑关闭后如需继续使用账号能力，可另行配置手机本机会话。",
                13,
                Ui.MUTED,
                false
            );
            note.setPadding(Ui.dp(this,4),Ui.dp(this,4),Ui.dp(this,4),Ui.dp(this,10));
            content.addView(note);
            LinearLayout actions=new LinearLayout(this);
            actions.setGravity(Gravity.CENTER_VERTICAL);
            actions.addView(compact("配置手机本机会话",v->startActivity(new Intent(this,EhWebLoginActivity.class))));
            Ui.gap(actions,this,8);
            actions.addView(compact("官方账号 ▾",v->showOfficialAccountActions()));
            content.addView(actions);
        }else{
            LinearLayout actions=new LinearLayout(this);
            actions.setGravity(Gravity.CENTER_VERTICAL);
            actions.addView(compact("官方账号 ▾",v->showOfficialAccountActions()));
            Ui.gap(actions,this,8);
            actions.addView(compact("账号管理 ▾",v->showAccountActions()));
            content.addView(actions);
        }
        refreshExh(false);
    }

    private void showDisconnectedActions(){String[] labels={"手动导入会话","浏览器登录","注册账号"};new AlertDialog.Builder(this).setTitle(LocalizedText.ui("其他方式")).setItems(LocalizedText.ui(labels),(d,w)->{if(w==0)startActivity(new Intent(this,EhSessionActivity.class));else open(w==1?"https://forums.e-hentai.org/index.php?act=Login":"https://forums.e-hentai.org/index.php?act=Reg&CODE=00");}).setNegativeButton(LocalizedText.ui("取消"),null).show();}
    private void showOfficialAccountActions(){String[] labels={"浏览器登录","注册账号"};new AlertDialog.Builder(this).setTitle(LocalizedText.ui("E-H 官方账号")).setItems(LocalizedText.ui(labels),(d,w)->open(w==0?"https://forums.e-hentai.org/index.php?act=Login":"https://forums.e-hentai.org/index.php?act=Reg&CODE=00")).setNegativeButton(LocalizedText.ui("取消"),null).show();}
    private void showAccountActions(){String[] labels={"更新网页登录","手动更新会话","重新检查 ExH","清除本机会话"};new AlertDialog.Builder(this).setTitle(LocalizedText.ui("账号管理")).setItems(LocalizedText.ui(labels),(d,w)->{if(w==0)startActivity(new Intent(this,EhWebLoginActivity.class));else if(w==1)startActivity(new Intent(this,EhSessionActivity.class));else if(w==2)refreshExh(true);else confirmClearSession();}).setNegativeButton(LocalizedText.ui("取消"),null).show();}
    private void confirmClearSession(){new AlertDialog.Builder(this).setTitle(LocalizedText.ui("清除 E-H 账号？")).setMessage(LocalizedText.ui("只会删除本机登录会话。")) .setNegativeButton(LocalizedText.ui("取消"),null).setPositiveButton(LocalizedText.ui("清除"),(d,w)->clearSession()).show();}
    private void syncFavorites(){if(busy)return;busy=true;showFeedback("正在同步…",Ui.MUTED);new Thread(()->{try{EhFavoriteSync sync=new EhClient(this).favoritesSnapshot();UnifiedEhCatalogSync.mergeAll(this,sync.comics);EhFavoriteStore.replaceRemote(this,sync);runOnUiThread(()->{busy=false;hideFeedback();Toast.makeText(this,LocalizedText.ui("已同步 ")+sync.comics.size()+LocalizedText.ui(" 本"),Toast.LENGTH_SHORT).show();});}catch(Exception e){runOnUiThread(()->{busy=false;showFeedback(syncError(e),Ui.BAD);});}}).start();}
    private String syncError(Exception e){String m=e.getMessage()==null?"":e.getMessage();if(m.contains("会话无效")||m.contains("已过期"))return "登录会话已过期，请更新会话。";return m.isEmpty()?"同步失败，请稍后重试。":"同步失败："+m;}
    private void refreshExh(boolean force){if(!EhClient.accountAvailable(this)){applyExh(EhCapabilityStore.load(this));return;}final int id=++probeSerial;if(force&&exhState!=null){exhState.setText(LocalizedText.ui("检查中"));exhState.setTextColor(Ui.MUTED);}EhCapabilityStore.refreshAsync(this,force,value->{if(id!=probeSerial||isDestroyed()||exhState==null)return;applyExh(value);});}
    private void applyExh(EhCapabilityStore.Snapshot value){if(exhState==null)return;exhState.setText(value.label());exhState.setTextColor(statusColor(value));}
    private int statusColor(EhCapabilityStore.Snapshot value){if(value.state==EhCapabilityStore.State.AVAILABLE)return SettingsRow.statusColor("可用");if(value.state==EhCapabilityStore.State.CURRENTLY_UNAVAILABLE||value.state==EhCapabilityStore.State.NETWORK_ERROR)return Ui.MUTED;return Ui.MUTED;}
    private void clearSession(){if(busy)return;EhAccountStore.clear(this);Toast.makeText(this,LocalizedText.ui("E-H 账号已清除"),Toast.LENGTH_SHORT).show();renderContent();}
    private void open(String url){try{startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse(url)));}catch(Exception e){showFeedback(url.contains("Reg")?"无法打开注册页面":"无法打开登录页面",Ui.BAD);}}
    private void refreshDesktopAccountState(){
        if(!BridgeStore.paired(this))return;
        final int id=++desktopSerial;
        new Thread(()->{
            try{
                DesktopAccountStatusStore.save(this,BridgeClient.accountStatus(this));
                runOnUiThread(()->{
                    if(id!=desktopSerial||isDestroyed())return;
                    renderContent();
                });
            }catch(Exception ignored){}
        }).start();
    }
    private void showFeedback(String text,int color){if(feedback==null)return;feedback.setText(text);feedback.setTextColor(color);feedback.setVisibility(View.VISIBLE);}
    private void hideFeedback(){if(feedback!=null)feedback.setVisibility(View.GONE);}
}
