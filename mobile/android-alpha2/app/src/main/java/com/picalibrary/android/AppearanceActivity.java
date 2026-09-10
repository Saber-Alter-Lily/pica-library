package com.picalibrary.android;

import android.app.Activity;
import android.os.Bundle;
import android.view.Gravity;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

/** Base appearance is always available. GitHub Star controls optional theme packs. */
public final class AppearanceActivity extends Activity {
    private LinearLayout content;
    @Override public void onCreate(Bundle saved){super.onCreate(saved);Ui.applyWindow(this);render();}
    @Override public void onResume(){super.onResume();Ui.applyWindow(this);if(content!=null)renderContent();}
    private void render(){LinearLayout root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);root.setBackgroundColor(Ui.BG);root.setOnApplyWindowInsetsListener((v,i)->{v.setPadding(0,i.getSystemWindowInsetTop(),0,i.getSystemWindowInsetBottom());return i;});LinearLayout bar=new LinearLayout(this);bar.setGravity(Gravity.CENTER_VERTICAL);bar.setPadding(Ui.dp(this,8),Ui.dp(this,4),Ui.dp(this,12),Ui.dp(this,4));bar.addView(Ui.button(this,"‹ 返回",v->finish(),true));bar.addView(Ui.text(this,"外观",22,Ui.TEXT,true),new LinearLayout.LayoutParams(0,-2,1));root.addView(bar);ScrollView scroll=new ScrollView(this);scroll.setBackgroundColor(Ui.BG);content=new LinearLayout(this);content.setOrientation(LinearLayout.VERTICAL);content.setPadding(Ui.dp(this,8),Ui.dp(this,6),Ui.dp(this,8),Ui.dp(this,24));scroll.addView(content);root.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));setContentView(root);root.requestApplyInsets();renderContent();}
    private void renderContent(){content.removeAllViews();LinearLayout base=Ui.card(this);base.addView(Ui.text(this,"明暗模式",18,Ui.TEXT,true));LinearLayout modes=new LinearLayout(this);modes.setPadding(0,Ui.dp(this,10),0,0);modes.addView(modeButton("跟随系统",ThemeStore.MODE_SYSTEM),new LinearLayout.LayoutParams(0,-2,1));Ui.gap(modes,this,6);modes.addView(modeButton("浅色",ThemeStore.MODE_LIGHT),new LinearLayout.LayoutParams(0,-2,1));Ui.gap(modes,this,6);modes.addView(modeButton("深色",ThemeStore.MODE_DARK),new LinearLayout.LayoutParams(0,-2,1));base.addView(modes);content.addView(base);
        LinearLayout preview=Ui.card(this);preview.addView(Ui.text(this,"主题预览",18,Ui.TEXT,true));TextView line=Ui.text(this,"正文文字 · 次要信息 · 强调色",14,Ui.TEXT,false);line.setPadding(0,Ui.dp(this,8),0,Ui.dp(this,10));preview.addView(line);LinearLayout row=new LinearLayout(this);row.addView(Ui.pill(this,"正常",Ui.GOOD_SOFT,Ui.GOOD));Ui.gap(row,this,8);row.addView(Ui.pill(this,"提醒",Ui.WARN_SOFT,Ui.WARN));Ui.gap(row,this,8);row.addView(Ui.pill(this,"收藏",Ui.PRIMARY_SOFT,Ui.PRIMARY));preview.addView(row);content.addView(preview);
        LinearLayout advanced=Ui.card(this);advanced.addView(Ui.text(this,"个性化装扮",18,Ui.TEXT,true));advanced.addView(Ui.text(this,StarAccessStore.enabled(this)?"GitHub Star 已验证。可使用 Pica Violet · 星漫和自己的主题包。":"给 Pica Library 项目一个 Star，即可解锁个性化装扮；也可以从已配对电脑同步验证状态。",13,Ui.MUTED,false));advanced.addView(Ui.button(this,StarAccessStore.enabled(this)?"管理装扮包":"验证或同步 GitHub Star",v->startActivity(new android.content.Intent(this,ThemePackActivity.class)),false));content.addView(advanced);}
    private Button modeButton(String label,String mode){boolean active=ThemeStore.mode(this).equals(mode);Button b=Ui.button(this,(active?"✓ ":"")+label,v->{ThemeStore.setMode(this,mode);Ui.applyTheme(this);render();},true);if(active){b.setTextColor(Ui.TEXT);b.setBackground(Ui.rounded(Ui.PRIMARY_SOFT,12,this));}return b;}
}
