package com.picalibrary.android;

import android.app.*;
import android.content.*;
import android.os.Bundle;
import android.view.Gravity;
import android.widget.*;

/** Unified account/source management. ExH remains an E-H account capability, never a separate login. */
public final class AccountSourcesActivity extends Activity {
    private LinearLayout content;private TextView exhState;private int probeSerial;
    @Override public void onCreate(Bundle saved){super.onCreate(saved);Ui.applyWindow(this);renderShell();}
    @Override protected void onResume(){super.onResume();renderContent();}
    @Override protected void onDestroy(){probeSerial++;super.onDestroy();}

    private void renderShell(){LinearLayout root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);root.setBackgroundColor(Ui.BG);root.setOnApplyWindowInsetsListener((v,i)->{v.setPadding(0,i.getSystemWindowInsetTop(),0,i.getSystemWindowInsetBottom());return i;});LinearLayout bar=new LinearLayout(this);bar.setGravity(Gravity.CENTER_VERTICAL);bar.setPadding(Ui.dp(this,8),Ui.dp(this,6),Ui.dp(this,8),Ui.dp(this,4));bar.addView(Ui.button(this,"‹ 返回",v->finish(),true));bar.addView(Ui.text(this,"账号与来源",22,Ui.TEXT,true),new LinearLayout.LayoutParams(0,-2,1));root.addView(bar);ScrollView scroll=new ScrollView(this);content=new LinearLayout(this);content.setOrientation(LinearLayout.VERTICAL);content.setPadding(Ui.dp(this,14),Ui.dp(this,12),Ui.dp(this,14),Ui.dp(this,24));scroll.addView(content);root.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));setContentView(root);root.requestApplyInsets();renderContent();}
    private void renderContent(){if(content==null)return;probeSerial++;content.removeAllViews();boolean pica=PicaAccountStore.load(this).configured(),eh=EhAccountStore.load(this).configured();content.addView(SettingsRow.row(this,"Pica",pica?"已连接":"未连接",v->startActivity(new Intent(this,PicaAccountActivity.class))));LinearLayout card=SettingsRow.panel(this,v->startActivity(new Intent(this,EhAccountActivity.class)));LinearLayout head=new LinearLayout(this);head.setGravity(Gravity.CENTER_VERTICAL);head.addView(Ui.text(this,"E-Hentai / ExHentai",16,Ui.TEXT,true),new LinearLayout.LayoutParams(0,-2,1));TextView arrow=Ui.text(this,"›",24,Ui.MUTED,false);head.addView(arrow);card.addView(head);card.addView(SettingsRow.statusLine(this,"E-H 账号",eh?"已登录":"未登录"));exhState=Ui.text(this,eh?"检查中":"需登录",13,Ui.MUTED,true);card.addView(SettingsRow.statusLine(this,"ExH 权限",exhState));content.addView(card);if(eh)probeExh();}
    private void probeExh(){final int id=++probeSerial;new Thread(()->{String value=new EhClient(this).probeExH();runOnUiThread(()->{if(id!=probeSerial||isDestroyed()||exhState==null)return;String label="AVAILABLE".equals(value)?"可用":"NETWORK_ERROR".equals(value)?"网络异常":"无权限";exhState.setText(label);exhState.setTextColor(SettingsRow.statusColor(label));});}).start();}
}
