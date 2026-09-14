package com.picalibrary.android;

import android.app.*;
import android.content.*;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.os.Bundle;
import android.view.Gravity;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Toast;

/** Compact About page; legal detail remains explicitly opened on demand. */
public final class AboutActivity extends Activity {
    @Override public void onCreate(Bundle saved){super.onCreate(saved);Ui.applyWindow(this);render();}
    private void render(){LinearLayout root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);root.setBackgroundColor(Ui.BG);root.setOnApplyWindowInsetsListener((v,i)->{v.setPadding(0,i.getSystemWindowInsetTop(),0,i.getSystemWindowInsetBottom());return i;});LinearLayout bar=new LinearLayout(this);bar.setGravity(Gravity.CENTER_VERTICAL);bar.setPadding(Ui.dp(this,8),Ui.dp(this,6),Ui.dp(this,8),Ui.dp(this,4));bar.addView(Ui.button(this,"‹ 返回",v->finish(),true));bar.addView(Ui.text(this,"关于",22,Ui.TEXT,true),new LinearLayout.LayoutParams(0,-2,1));root.addView(bar);ScrollView scroll=new ScrollView(this);LinearLayout content=new LinearLayout(this);content.setOrientation(LinearLayout.VERTICAL);content.setPadding(Ui.dp(this,14),Ui.dp(this,12),Ui.dp(this,14),Ui.dp(this,24));scroll.addView(content);root.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));content.addView(SettingsRow.row(this,"Pica Library",versionName(),null));content.addView(SettingsRow.row(this,"GitHub 项目主页","",v->open("https://github.com/Saber-Alter-Lily/pica-library")));content.addView(SettingsRow.row(this,"使用提示与免责声明","",v->{Intent i=new Intent(this,DisclaimerActivity.class);i.putExtra("reviewOnly",true);startActivity(i);}));setContentView(root);root.requestApplyInsets();}
    private String versionName(){try{PackageInfo info=getPackageManager().getPackageInfo(getPackageName(),0);return info.versionName==null?"":info.versionName;}catch(Exception e){return "";}}
    private void open(String url){try{startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse(url)));}catch(Exception e){Toast.makeText(this,"无法打开页面",Toast.LENGTH_SHORT).show();}}
}
