package com.picalibrary.android;

import android.app.*;
import android.content.*;
import android.os.Bundle;
import android.view.Gravity;
import android.widget.*;

/** Unified account/source management. Desktop pairing mirrors non-secret provider state only. */
public final class AccountSourcesActivity extends LocaleAwareActivity {
    private LinearLayout content;
    private TextView exhState;
    private int probeSerial,desktopSerial;

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
        probeSerial++;
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
        bar.setPadding(Ui.dp(this,8),Ui.dp(this,6),Ui.dp(this,8),Ui.dp(this,4));
        bar.addView(Ui.button(this,"‹ 返回",v->finish(),true));
        bar.addView(Ui.text(this,"账号与来源",22,Ui.TEXT,true),new LinearLayout.LayoutParams(0,-2,1));
        root.addView(bar);
        ScrollView scroll=new ScrollView(this);
        content=new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(Ui.dp(this,14),Ui.dp(this,12),Ui.dp(this,14),Ui.dp(this,24));
        scroll.addView(content);
        root.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));
        setContentView(root);
        root.requestApplyInsets();
        renderContent();
    }

    private static String status(boolean local,boolean desktop){
        if(local)return "已登录（本机）";
        if(desktop)return "已由 Desktop 连接";
        return "未连接";
    }

    private void renderContent(){
        if(content==null)return;
        probeSerial++;
        content.removeAllViews();

        boolean paired=BridgeStore.paired(this);
        boolean localPica=PicaAccountStore.load(this).configured();
        boolean localEh=EhAccountStore.load(this).configured();
        DesktopAccountStatusStore.Snapshot desktop=paired
            ? DesktopAccountStatusStore.load(this)
            : new DesktopAccountStatusStore.Snapshot(false,false,0L);

        content.addView(SettingsRow.row(
            this,
            "Pica",
            status(localPica,desktop.picaConfigured),
            v->startActivity(new Intent(this,PicaAccountActivity.class))
        ));

        LinearLayout card=SettingsRow.panel(this,v->startActivity(new Intent(this,EhAccountActivity.class)));
        LinearLayout head=new LinearLayout(this);
        head.setGravity(Gravity.CENTER_VERTICAL);
        head.addView(Ui.text(this,"E-Hentai / ExHentai",16,Ui.TEXT,true),new LinearLayout.LayoutParams(0,-2,1));
        head.addView(Ui.text(this,"›",24,Ui.MUTED,false));
        card.addView(head);
        card.addView(SettingsRow.statusLine(
            this,
            "E-H 账号",
            status(localEh,desktop.ehConfigured)
        ));

        EhCapabilityStore.Snapshot capability=EhCapabilityStore.load(this);
        String exhLabel=localEh
            ? capability.label()
            : desktop.ehConfigured
                ? "由 Desktop 提供"
                : capability.label();
        exhState=Ui.text(
            this,
            exhLabel,
            13,
            localEh&&capability.state==EhCapabilityStore.State.AVAILABLE
                ? SettingsRow.statusColor("可用")
                : Ui.MUTED,
            true
        );
        card.addView(SettingsRow.statusLine(this,"ExH 扩展",exhState));
        content.addView(card);

        if(paired&&(desktop.picaConfigured||desktop.ehConfigured)){
            TextView note=Ui.text(
                this,
                "已自动同步 Desktop 的账号连接状态。电脑在线且已配对时，不需要为了 Desktop 提供的功能在手机重复登录；只有希望电脑关闭后仍由手机直接访问在线来源时，才需要配置手机本机账号。",
                13,
                Ui.MUTED,
                false
            );
            note.setPadding(Ui.dp(this,4),Ui.dp(this,10),Ui.dp(this,4),Ui.dp(this,6));
            content.addView(note);
        }

        if(localEh)refreshExh();
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

    private void refreshExh(){
        final int id=++probeSerial;
        EhCapabilityStore.refreshAsync(this,false,value->{
            if(id!=probeSerial||isDestroyed()||exhState==null)return;
            exhState.setText(value.label());
            exhState.setTextColor(
                value.state==EhCapabilityStore.State.AVAILABLE
                    ? SettingsRow.statusColor("可用")
                    : Ui.MUTED
            );
        });
    }
}
