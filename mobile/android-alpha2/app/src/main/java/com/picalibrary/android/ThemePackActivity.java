package com.picalibrary.android;

import android.app.Activity;
import android.os.Bundle;
import android.view.Gravity;
import android.widget.*;
import java.util.*;

/** Supporter-only theme pack selector. Theme creation/import remains Desktop-first. */
public final class ThemePackActivity extends Activity {
    private LinearLayout content;
    @Override public void onCreate(Bundle saved){super.onCreate(saved);Ui.applyWindow(this);if(!SupporterEntitlement.themePacksEnabled(this)){finish();return;}render();}
    @Override protected void onResume(){super.onResume();Ui.applyWindow(this);if(content!=null)renderList();}
    private void render(){LinearLayout root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);root.setBackgroundColor(Ui.BG);root.setOnApplyWindowInsetsListener((v,i)->{v.setPadding(0,i.getSystemWindowInsetTop(),0,i.getSystemWindowInsetBottom());return i;});LinearLayout bar=new LinearLayout(this);bar.setGravity(Gravity.CENTER_VERTICAL);bar.addView(Ui.button(this,"‹ 返回",v->finish(),true));bar.addView(Ui.text(this,"个性化装扮",22,Ui.TEXT,true),new LinearLayout.LayoutParams(0,-2,1));root.addView(bar);ScrollView scroll=new ScrollView(this);scroll.setBackgroundColor(Ui.BG);content=new LinearLayout(this);content.setOrientation(LinearLayout.VERTICAL);content.setPadding(Ui.dp(this,8),Ui.dp(this,6),Ui.dp(this,8),Ui.dp(this,24));scroll.addView(content);root.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));setContentView(root);root.requestApplyInsets();renderList();}
    private void renderList(){content.removeAllViews();LinearLayout sync=Ui.card(this);sync.addView(Ui.text(this,"装扮包",18,Ui.TEXT,true));sync.addView(Ui.text(this,"推荐在电脑网页端拖入 .pica-theme 文件。连接同一局域网后，手机可同步已安装装扮。",13,Ui.MUTED,false));if(BridgeStore.paired(this))sync.addView(Ui.button(this,"从电脑同步装扮",v->syncFromDesktop(),false));content.addView(sync);String active=ThemePackStore.activeId(this);for(ThemePackStore.Pack pack:ThemePackStore.list(this)){LinearLayout card=Ui.card(this);LinearLayout row=new LinearLayout(this);row.setGravity(Gravity.CENTER_VERTICAL);row.addView(Ui.text(this,pack.name,17,Ui.TEXT,true),new LinearLayout.LayoutParams(0,-2,1));if(pack.id.equals(active))row.addView(Ui.pill(this,"使用中",Ui.GOOD_SOFT,Ui.GOOD));card.addView(row);card.addView(Ui.text(this,pack.author+" · "+pack.version+(pack.description.isEmpty()?"":"\n"+pack.description),12,Ui.MUTED,false));Button use=Ui.button(this,pack.id.equals(active)?"已启用":"使用此装扮",v->{ThemePackStore.activate(this,pack.id);Ui.applyWindow(this);Toast.makeText(this,"装扮已应用",Toast.LENGTH_SHORT).show();recreate();},false);use.setEnabled(!pack.id.equals(active));card.addView(use);content.addView(card);}if(!active.isEmpty()){LinearLayout reset=Ui.card(this);reset.addView(Ui.button(this,"恢复默认外观",v->{ThemePackStore.deactivate(this);Ui.applyWindow(this);recreate();},false));content.addView(reset);}}
    private void syncFromDesktop(){Toast.makeText(this,"正在从电脑同步…",Toast.LENGTH_SHORT).show();new Thread(()->{try{int count=ThemePackSync.sync(this);runOnUiThread(()->{Toast.makeText(this,"已同步 "+count+" 个装扮包",Toast.LENGTH_SHORT).show();renderList();});}catch(Exception e){runOnUiThread(()->Toast.makeText(this,"同步失败："+(e.getMessage()==null?"请检查电脑连接":e.getMessage()),Toast.LENGTH_LONG).show());}}).start();}
}
