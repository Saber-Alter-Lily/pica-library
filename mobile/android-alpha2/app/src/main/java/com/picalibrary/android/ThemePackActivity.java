package com.picalibrary.android;

import android.app.Activity;
import android.os.Bundle;
import android.view.Gravity;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Toast;
import java.util.*;

/** GitHub-Star theme selector. Theme creation/import remains Desktop-first. */
public final class ThemePackActivity extends Activity {
    private LinearLayout content;
    @Override public void onCreate(Bundle saved){super.onCreate(saved);Ui.applyWindow(this);render();}
    @Override protected void onResume(){super.onResume();Ui.applyWindow(this);if(content!=null)renderList();}
    private void render(){LinearLayout root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);root.setBackgroundColor(Ui.BG);root.setOnApplyWindowInsetsListener((v,i)->{v.setPadding(0,i.getSystemWindowInsetTop(),0,i.getSystemWindowInsetBottom());return i;});LinearLayout bar=new LinearLayout(this);bar.setGravity(Gravity.CENTER_VERTICAL);bar.addView(Ui.button(this,"‹ 返回",v->finish(),true));bar.addView(Ui.text(this,"个性化装扮",22,Ui.TEXT,true),new LinearLayout.LayoutParams(0,-2,1));root.addView(bar);ScrollView scroll=new ScrollView(this);scroll.setBackgroundColor(Ui.BG);content=new LinearLayout(this);content.setOrientation(LinearLayout.VERTICAL);content.setPadding(Ui.dp(this,8),Ui.dp(this,6),Ui.dp(this,8),Ui.dp(this,24));scroll.addView(content);root.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));setContentView(root);root.requestApplyInsets();renderList();}
    private void renderList(){
        content.removeAllViews();
        if(!StarAccessStore.enabled(this)){
            LinearLayout unlock=Ui.card(this);
            unlock.addView(Ui.text(this,"GitHub Star 解锁",18,Ui.TEXT,true));
            unlock.addView(Ui.text(this,"给 Pica Library 仓库一个 Star 后，在这里输入 GitHub 用户名验证。验证成功会保存在本机。",13,Ui.MUTED,false));
            EditText username=new EditText(this);username.setSingleLine(true);username.setHint("GitHub 用户名");Ui.styleField(username,this);String remembered=StarAccessStore.user(this);if(!remembered.isEmpty())username.setText(remembered);unlock.addView(username);
            Button verify=Ui.button(this,"验证 GitHub Star",v->{verify.setEnabled(false);String user=username.getText().toString();StarAccessStore.verify(this,user,(ok,message)->{verify.setEnabled(true);Toast.makeText(this,message,ok?Toast.LENGTH_SHORT:Toast.LENGTH_LONG).show();if(ok){Ui.applyTheme(this);recreate();}});},false);
            unlock.addView(verify);
            if(BridgeStore.paired(this))unlock.addView(Ui.button(this,"从已配对电脑同步解锁与装扮",v->syncFromDesktop(),false));
            content.addView(unlock);
            return;
        }
        LinearLayout sync=Ui.card(this);sync.addView(Ui.text(this,"装扮包",18,Ui.TEXT,true));sync.addView(Ui.text(this,"Pica Violet · 星漫已内置。电脑网页端导入的 .pica-theme 可通过局域网同步到手机，已有本地装扮不会因升级被清除。",13,Ui.MUTED,false));if(BridgeStore.paired(this))sync.addView(Ui.button(this,"从电脑同步装扮",v->syncFromDesktop(),false));content.addView(sync);
        String active=ThemePackStore.activeId(this);
        for(ThemePackStore.Pack pack:ThemePackStore.list(this)){
            LinearLayout card=Ui.card(this);LinearLayout row=new LinearLayout(this);row.setGravity(Gravity.CENTER_VERTICAL);row.addView(Ui.text(this,pack.name,17,Ui.TEXT,true),new LinearLayout.LayoutParams(0,-2,1));if(pack.id.equals(active))row.addView(Ui.pill(this,"使用中",Ui.GOOD_SOFT,Ui.GOOD));card.addView(row);card.addView(Ui.text(this,pack.author+" · "+pack.version+(pack.description.isEmpty()?"":"\n"+pack.description),12,Ui.MUTED,false));Button use=Ui.button(this,pack.id.equals(active)?"已启用":"使用此装扮",v->{ThemePackStore.activate(this,pack.id);Ui.applyWindow(this);Toast.makeText(this,"装扮已应用",Toast.LENGTH_SHORT).show();recreate();},false);use.setEnabled(!pack.id.equals(active));card.addView(use);content.addView(card);
        }
        if(!active.isEmpty()){LinearLayout reset=Ui.card(this);reset.addView(Ui.button(this,"恢复默认外观",v->{ThemePackStore.deactivate(this);Ui.applyWindow(this);recreate();},false));content.addView(reset);}
    }
    private void syncFromDesktop(){Toast.makeText(this,"正在从电脑同步…",Toast.LENGTH_SHORT).show();new Thread(()->{try{int count=ThemePackSync.sync(this);runOnUiThread(()->{Toast.makeText(this,"已同步 "+count+" 个装扮包",Toast.LENGTH_SHORT).show();Ui.applyTheme(this);recreate();});}catch(Exception e){runOnUiThread(()->Toast.makeText(this,"同步失败："+(e.getMessage()==null?"请检查电脑连接":e.getMessage()),Toast.LENGTH_LONG).show());}}).start();}
}
