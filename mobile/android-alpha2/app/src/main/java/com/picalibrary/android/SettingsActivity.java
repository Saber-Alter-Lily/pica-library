package com.picalibrary.android;

import android.app.*;
import android.content.*;
import android.os.Bundle;
import android.view.Gravity;
import android.widget.LinearLayout;
import android.widget.ScrollView;

/** Top-level settings list. Paired Desktop account state is mirrored without secrets. */
public final class SettingsActivity extends Activity {
    private LinearLayout content;
    private int desktopSerial;

    @Override public void onCreate(Bundle saved){
        super.onCreate(saved);
        Ui.applyWindow(this);
        renderShell();
    }

    @Override protected void onResume(){
        super.onResume();
        renderContent();
        refreshDesktopAccountState();
    }

    @Override protected void onDestroy(){
        desktopSerial++;
        super.onDestroy();
    }

    private void renderShell(){
        LinearLayout root=new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Ui.BG);
        root.setOnApplyWindowInsetsListener((v,i)->{
            v.setPadding(0,i.getSystemWindowInsetTop(),0,i.getSystemWindowInsetBottom());
            return i;
        });
        LinearLayout bar=new LinearLayout(this);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setPadding(Ui.dp(this,14),Ui.dp(this,10),Ui.dp(this,14),Ui.dp(this,6));
        bar.addView(Ui.text(this,"设置",26,Ui.TEXT,true),new LinearLayout.LayoutParams(0,-2,1));
        root.addView(bar);
        ScrollView scroll=new ScrollView(this);
        content=new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(Ui.dp(this,14),Ui.dp(this,8),Ui.dp(this,14),Ui.dp(this,24));
        scroll.addView(content);
        root.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));
        root.addView(ShellNavigation.build(this,3));
        setContentView(root);
        root.requestApplyInsets();
        renderContent();
    }

    private void renderContent(){
        if(content==null)return;
        content.removeAllViews();
        boolean paired=BridgeStore.paired(this);
        boolean pica=PicaAccountStore.load(this).configured();
        boolean eh=EhAccountStore.load(this).configured();
        DesktopAccountStatusStore.Snapshot desktop=paired
            ? DesktopAccountStatusStore.load(this)
            : new DesktopAccountStatusStore.Snapshot(false,false,0L);
        String accountStatus=(pica||eh)
            ? "本机已配置"
            : (desktop.picaConfigured||desktop.ehConfigured)
                ? "Desktop 已连接"
                : "";

        content.addView(SettingsRow.row(this,"账号与来源",accountStatus,v->startActivity(new Intent(this,AccountSourcesActivity.class))));
        content.addView(SettingsRow.row(this,"连接电脑",paired?"已连接":"未连接",v->startActivity(new Intent(this,PairingActivity.class))));
        content.addView(SettingsRow.row(this,"存储与下载","",v->startActivity(new Intent(this,StorageHubActivity.class))));
        content.addView(SettingsRow.row(this,"个性化",ThemeStore.label(this),v->startActivity(new Intent(this,AppearanceActivity.class))));
        content.addView(SettingsRow.row(this,"推荐与画风",paired?"独立运行 · 可同步":"本机独立运行",v->startActivity(new Intent(this,RecommendationStyleActivity.class))));
        content.addView(SettingsRow.row(this,"数据与缓存","",v->startActivity(new Intent(this,StorageSettingsActivity.class))));
        content.addView(SettingsRow.row(this,"软件更新","",v->startActivity(new Intent(this,UpdateActivity.class))));
        content.addView(SettingsRow.row(this,"关于","",v->startActivity(new Intent(this,AboutActivity.class))));
    }

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
}
