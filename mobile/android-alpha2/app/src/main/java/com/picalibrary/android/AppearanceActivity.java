package com.picalibrary.android;

import android.app.*;
import android.content.Intent;
import android.os.Bundle;
import android.view.Gravity;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import java.util.*;

/** Quiet personalization hub: appearance, active theme and GitHub Star status. */
public final class AppearanceActivity extends Activity {
    private LinearLayout content;
    @Override public void onCreate(Bundle saved){super.onCreate(saved);Ui.applyWindow(this);render();}
    @Override public void onResume(){super.onResume();Ui.applyWindow(this);if(content!=null)renderContent();}
    private void render(){LinearLayout root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);root.setBackgroundColor(Ui.BG);root.setOnApplyWindowInsetsListener((v,i)->{v.setPadding(0,i.getSystemWindowInsetTop(),0,i.getSystemWindowInsetBottom());return i;});LinearLayout bar=new LinearLayout(this);bar.setGravity(Gravity.CENTER_VERTICAL);bar.setPadding(Ui.dp(this,8),Ui.dp(this,6),Ui.dp(this,8),Ui.dp(this,4));bar.addView(Ui.button(this,"‹ 返回",v->finish(),true));bar.addView(Ui.text(this,"个性化",22,Ui.TEXT,true),new LinearLayout.LayoutParams(0,-2,1));root.addView(bar);ScrollView scroll=new ScrollView(this);content=new LinearLayout(this);content.setOrientation(LinearLayout.VERTICAL);content.setPadding(Ui.dp(this,14),Ui.dp(this,12),Ui.dp(this,14),Ui.dp(this,24));scroll.addView(content);root.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));setContentView(root);root.requestApplyInsets();renderContent();}
    private void renderContent(){content.removeAllViews();content.addView(SettingsRow.row(this,"外观",modeLabel(),v->chooseMode()));content.addView(SettingsRow.row(this,"主题",themeLabel(),v->startActivity(new Intent(this,ThemePackActivity.class))));content.addView(SettingsRow.row(this,"GitHub Star",StarAccessStore.enabled(this)?"已验证":"未验证",v->startActivity(new Intent(this,ThemePackActivity.class))));}
    private String modeLabel(){String mode=ThemeStore.mode(this);if(ThemeStore.MODE_LIGHT.equals(mode))return "浅色";if(ThemeStore.MODE_DARK.equals(mode))return "深色";return "跟随系统";}
    private String themeLabel(){String active=ThemePackStore.activeId(this);if(active==null||active.isEmpty())return "默认";for(ThemePackStore.Pack pack:ThemePackStore.list(this))if(active.equals(pack.id))return pack.name;return "自定义";}
    private void chooseMode(){String[] labels={"跟随系统","浅色","深色"};String[] modes={ThemeStore.MODE_SYSTEM,ThemeStore.MODE_LIGHT,ThemeStore.MODE_DARK};String current=ThemeStore.mode(this);int selected=0;for(int i=0;i<modes.length;i++)if(modes[i].equals(current))selected=i;new AlertDialog.Builder(this).setTitle("外观").setSingleChoiceItems(labels,selected,(d,w)->{ThemeStore.setMode(this,modes[w]);Ui.applyTheme(this);d.dismiss();recreate();}).setNegativeButton("取消",null).show();}
}
