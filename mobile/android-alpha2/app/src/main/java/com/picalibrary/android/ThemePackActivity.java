package com.picalibrary.android;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

/** Compact authenticated theme selector. Verification detail appears only during verification. */
public final class ThemePackActivity extends LocaleAwareActivity {
    private LinearLayout content;
    private boolean authInProgress=false;
    private TextView authStatus;

    @Override public void onCreate(Bundle saved){super.onCreate(saved);Ui.applyWindow(this);render();}
    @Override protected void onResume(){super.onResume();Ui.applyWindow(this);if(content!=null&&!authInProgress)renderList();}

    private void render(){LinearLayout root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);root.setBackgroundColor(Ui.BG);root.setOnApplyWindowInsetsListener((v,i)->{v.setPadding(0,i.getSystemWindowInsetTop(),0,i.getSystemWindowInsetBottom());return i;});LinearLayout bar=new LinearLayout(this);bar.setGravity(Gravity.CENTER_VERTICAL);bar.setPadding(Ui.dp(this,8),Ui.dp(this,6),Ui.dp(this,8),Ui.dp(this,4));bar.addView(Ui.button(this,"‹ 返回",v->finish(),true));bar.addView(Ui.text(this,"主题",22,Ui.TEXT,true),new LinearLayout.LayoutParams(0,-2,1));root.addView(bar);ScrollView scroll=new ScrollView(this);content=new LinearLayout(this);content.setOrientation(LinearLayout.VERTICAL);content.setPadding(Ui.dp(this,14),Ui.dp(this,12),Ui.dp(this,14),Ui.dp(this,24));scroll.addView(content);root.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));setContentView(root);root.requestApplyInsets();renderList();}

    private void renderList(){content.removeAllViews();boolean unlocked=StarAccessStore.enabled(this);content.addView(SettingsRow.row(this,"GitHub Star",unlocked?"已验证":"未验证",null));if(!unlocked){Button verify=Ui.button(this,"开始验证",v->startVerification((Button)v),false);content.addView(verify,new LinearLayout.LayoutParams(-1,-2));authStatus=Ui.text(this,"",13,Ui.MUTED,false);authStatus.setVisibility(View.GONE);authStatus.setPadding(Ui.dp(this,4),Ui.dp(this,8),Ui.dp(this,4),0);content.addView(authStatus);content.addView(SettingsRow.row(this,"验证方式","",v->showVerificationActions()));return;}String active=ThemePackStore.activeId(this);for(ThemePackStore.Pack pack:ThemePackStore.list(this)){String state=pack.id.equals(active)?"使用中":"";content.addView(SettingsRow.row(this,pack.name,state,v->activate(pack)));}content.addView(SettingsRow.row(this,"主题操作","",v->showThemeActions(active)));}

    private void startVerification(Button button){if(authInProgress)return;button.setEnabled(false);authInProgress=true;showAuth("正在生成验证码…",Ui.MUTED);GitHubAccountAuth.start(this,new GitHubAccountAuth.Callback(){public void code(String userCode,String uri){runOnUiThread(()->showCodeDialog(userCode,uri));}public void done(boolean ok,String message){runOnUiThread(()->{authInProgress=false;button.setEnabled(true);boolean unlocked=ok&&StarAccessStore.enabled(ThemePackActivity.this);if(unlocked){Toast.makeText(ThemePackActivity.this,LocalizedText.ui("GitHub Star 已验证"),Toast.LENGTH_SHORT).show();Ui.applyTheme(ThemePackActivity.this);renderList();}else showAuth(message==null||message.isEmpty()?"验证未完成":message,Ui.BAD);});}});}
    private void showCodeDialog(String userCode,String uri){new AlertDialog.Builder(this).setTitle(LocalizedText.ui("GitHub 验证")).setMessage(LocalizedText.ui("验证码：")+userCode).setNeutralButton(LocalizedText.ui("复制验证码"),(d,w)->copyCode(userCode)).setNegativeButton(LocalizedText.ui("稍后"),null).setPositiveButton(LocalizedText.ui("打开 GitHub"),(d,w)->{copyCode(userCode);try{startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse(uri)));}catch(Exception e){Toast.makeText(this,LocalizedText.ui("无法打开 GitHub"),Toast.LENGTH_SHORT).show();}}).show();}
    private void showVerificationActions(){java.util.ArrayList<String> labels=new java.util.ArrayList<>();labels.add("GitHub 项目主页");if(BridgeStore.paired(this))labels.add("从电脑同步已验证账号");new AlertDialog.Builder(this).setTitle(LocalizedText.ui("验证方式")).setItems(labels.toArray(new String[0]),(d,w)->{if(w==0)openProject();else syncFromDesktop();}).setNegativeButton(LocalizedText.ui("取消"),null).show();}
    private void showThemeActions(String active){java.util.ArrayList<String> labels=new java.util.ArrayList<>();if(BridgeStore.paired(this))labels.add("从电脑同步装扮包");if(active!=null&&!active.isEmpty())labels.add("恢复默认外观");if(labels.isEmpty()){Toast.makeText(this,LocalizedText.ui("没有可用操作"),Toast.LENGTH_SHORT).show();return;}new AlertDialog.Builder(this).setTitle(LocalizedText.ui("主题操作")).setItems(labels.toArray(new String[0]),(d,w)->{String action=labels.get(w);if(action.startsWith(LocalizedText.ui("从电脑")))syncFromDesktop();else{ThemePackStore.deactivate(this);Ui.applyWindow(this);Toast.makeText(this,LocalizedText.ui("已恢复默认外观"),Toast.LENGTH_SHORT).show();recreate();}}).setNegativeButton(LocalizedText.ui("取消"),null).show();}
    private void activate(ThemePackStore.Pack pack){if(!StarAccessStore.enabled(this)){Toast.makeText(this,LocalizedText.ui("请先完成 GitHub 验证"),Toast.LENGTH_LONG).show();return;}ThemePackStore.activate(this,pack.id);Ui.applyWindow(this);Toast.makeText(this,LocalizedText.ui("已应用"),Toast.LENGTH_SHORT).show();recreate();}
    private void showAuth(String text,int color){if(authStatus==null)return;authStatus.setText(text);authStatus.setTextColor(color);authStatus.setVisibility(View.VISIBLE);}
    private void copyCode(String value){ClipboardManager clipboard=getSystemService(ClipboardManager.class);if(clipboard!=null){clipboard.setPrimaryClip(ClipData.newPlainText("GitHub device code",value));Toast.makeText(this,LocalizedText.ui("验证码已复制"),Toast.LENGTH_SHORT).show();}}
    private void openProject(){try{startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse(StarAccessStore.REPOSITORY_URL)));}catch(Exception e){Toast.makeText(this,LocalizedText.ui("无法打开 GitHub"),Toast.LENGTH_SHORT).show();}}
    private void syncFromDesktop(){Toast.makeText(this,LocalizedText.ui("正在同步…"),Toast.LENGTH_SHORT).show();new Thread(()->{try{int count=ThemePackSync.sync(this);runOnUiThread(()->{Toast.makeText(this,LocalizedText.ui("已同步 ")+count+LocalizedText.ui(" 个装扮包"),Toast.LENGTH_SHORT).show();Ui.applyTheme(this);renderList();});}catch(Exception e){runOnUiThread(()->Toast.makeText(this,LocalizedText.ui("同步失败：")+(e.getMessage()==null?LocalizedText.ui("请检查电脑连接"):e.getMessage()),Toast.LENGTH_LONG).show());}}).start();}
}
