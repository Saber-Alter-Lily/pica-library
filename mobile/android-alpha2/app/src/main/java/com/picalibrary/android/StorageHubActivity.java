package com.picalibrary.android;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.view.Gravity;
import android.widget.LinearLayout;
import android.widget.ScrollView;

/** Storage/download operations only. Cache/data maintenance remains a separate Settings destination. */
public final class StorageHubActivity extends Activity {
    @Override public void onCreate(Bundle saved){super.onCreate(saved);Ui.applyWindow(this);render();}
    private void render(){
        LinearLayout root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);root.setBackgroundColor(Ui.BG);root.setOnApplyWindowInsetsListener((v,i)->{v.setPadding(0,i.getSystemWindowInsetTop(),0,i.getSystemWindowInsetBottom());return i;});
        LinearLayout bar=new LinearLayout(this);bar.setGravity(Gravity.CENTER_VERTICAL);bar.setPadding(Ui.dp(this,8),Ui.dp(this,6),Ui.dp(this,8),Ui.dp(this,4));bar.addView(Ui.button(this,"‹ 返回",v->finish(),true));bar.addView(Ui.text(this,"存储与下载",22,Ui.TEXT,true),new LinearLayout.LayoutParams(0,-2,1));root.addView(bar);
        ScrollView scroll=new ScrollView(this);LinearLayout content=new LinearLayout(this);content.setOrientation(LinearLayout.VERTICAL);content.setPadding(Ui.dp(this,14),Ui.dp(this,12),Ui.dp(this,14),Ui.dp(this,24));scroll.addView(content);root.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));
        content.addView(SettingsRow.row(this,"云端存储",RemoteConfigStore.load(this).configured()?"已配置":"未配置",v->startActivity(new Intent(this,RemoteStorageActivity.class))));
        content.addView(SettingsRow.row(this,"下载任务","",v->startActivity(new Intent(this,DownloadsActivity.class))));
        setContentView(root);root.requestApplyInsets();
    }
}
