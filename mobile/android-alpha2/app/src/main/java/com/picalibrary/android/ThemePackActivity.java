package com.picalibrary.android;

import android.app.Activity;
import android.os.Bundle;
import android.view.Gravity;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

/** Account-authenticated theme selector. Theme packs sync from Desktop; active choice stays local. */
public final class ThemePackActivity extends Activity {
    private LinearLayout content;
    @Override public void onCreate(Bundle saved){super.onCreate(saved);Ui.applyWindow(this);render();}
    @Override protected void onResume(){super.onResume();Ui.applyWindow(this);if(content!=null)renderList();}
    private void render(){LinearLayout root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);root.setBackgroundColor(Ui.BG);root.setOnApplyWindowInsetsListener((v,i)->{v.setPadding(0,i.getSystemWindowInsetTop(),0,i.getSystemWindowInsetBottom());return i;});LinearLayout bar=new LinearLayout(this);bar.setGravity(Gravity.CENTER_VERTICAL);bar.addView(Ui.button(this,"‹ 返回",v->finish(),true));bar.addView(Ui.text(this,"个性化装扮",22,Ui.TEXT,true),new LinearLayout.LayoutParams(0,-2,1));root.addView(bar);ScrollView scroll=new ScrollView(this);scroll.setBackgroundColor(Ui.BG);content=new LinearLayout(this);content.setOrientation(LinearLayout.VERTICAL);content.setPadding(Ui.dp(this,8),Ui.dp(this,6),Ui.dp(this,8),Ui.dp(this,24));scroll.addView(content);root.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));setContentView(root);root.requestApplyInsets();renderList();}
    private void renderList(){
        content.removeAllViews();
        if(!StarAccessStore.enabled(this)){
            LinearLayout unlock=Ui.card(this);
            unlock.addView(Ui.text(this,"GitHub 账号验证",18,Ui.TEXT,true));
            unlock.addView(Ui.text(this,"不再通过公开用户名判断 Star。请使用你自己的 GitHub 账号完成授权；Pica Library 只用临时访问令牌读取账号身份并检查当前账号是否 Star 本项目，验证完成后不会保存 GitHub Token。",13,Ui.MUTED,false));
            TextView code=Ui.text(this,"点击下方按钮后，将打开 GitHub 官方授权页面。",13,Ui.MUTED,false);code.setPadding(0,Ui.dp(this,8),0,Ui.dp(this,8));unlock.addView(code);
            Button verify=Ui.button(this,"使用 GitHub 账号验证",v->{Button button=(Button)v;button.setEnabled(false);code.setText("正在向 GitHub 请求一次性验证码…");GitHubAccountAuth.start(this,new GitHubAccountAuth.Callback(){public void code(String userCode,String uri){code.setText("GitHub 一次性验证码："+userCode+"\n已打开 "+uri+"。请在 GitHub 完成授权，软件会自动继续验证 Star。\n不要把此验证码发送给其他人。");}public void done(boolean ok,String message){button.setEnabled(true);Toast.makeText(ThemePackActivity.this,message,ok?Toast.LENGTH_SHORT:Toast.LENGTH_LONG).show();code.setText(message);if(ok){Ui.applyTheme(ThemePackActivity.this);recreate();}}});},false);
            unlock.addView(verify);
            unlock.addView(Ui.button(this,"⭐ 打开 Pica Library 项目",v->{try{startActivity(new android.content.Intent(android.content.Intent.ACTION_VIEW,android.net.Uri.parse(StarAccessStore.REPOSITORY_URL)));}catch(Exception ignored){}},true));
            if(BridgeStore.paired(this))unlock.addView(Ui.button(this,"从已配对电脑同步已验证账号与装扮包",v->syncFromDesktop(),true));
            content.addView(unlock);
            return;
        }
        LinearLayout identity=Ui.card(this);identity.addView(Ui.text(this,"GitHub 已验证",18,Ui.TEXT,true));identity.addView(Ui.text(this,StarAccessStore.user(this)+" · 账号 ID "+StarAccessStore.userId(this),13,Ui.MUTED,false));content.addView(identity);
        LinearLayout sync=Ui.card(this);sync.addView(Ui.text(this,"装扮包同步",18,Ui.TEXT,true));sync.addView(Ui.text(this,"Pica Violet · 星漫已内置。Desktop 导入的 .pica-theme 可以同步到手机，但 Desktop 和 Android 各自保存当前启用主题；同步装扮包不会再强制手机切换成电脑正在使用的主题。",13,Ui.MUTED,false));if(BridgeStore.paired(this))sync.addView(Ui.button(this,"从电脑同步可用装扮包",v->syncFromDesktop(),false));content.addView(sync);
        String active=ThemePackStore.activeId(this);
        for(ThemePackStore.Pack pack:ThemePackStore.list(this)){
            LinearLayout card=Ui.card(this);LinearLayout row=new LinearLayout(this);row.setGravity(Gravity.CENTER_VERTICAL);row.addView(Ui.text(this,pack.name,17,Ui.TEXT,true),new LinearLayout.LayoutParams(0,-2,1));if(pack.id.equals(active))row.addView(Ui.pill(this,"本机使用中",Ui.GOOD_SOFT,Ui.GOOD));card.addView(row);card.addView(Ui.text(this,pack.author+" · "+pack.version+(pack.description.isEmpty()?"":"\n"+pack.description),12,Ui.MUTED,false));Button use=Ui.button(this,pack.id.equals(active)?"本机已启用":"仅在本机使用此装扮",v->{ThemePackStore.activate(this,pack.id);Ui.applyWindow(this);Toast.makeText(this,"已在本机应用装扮；不会修改电脑端主题",Toast.LENGTH_SHORT).show();recreate();},false);use.setEnabled(!pack.id.equals(active));card.addView(use);content.addView(card);
        }
        if(!active.isEmpty()){LinearLayout reset=Ui.card(this);reset.addView(Ui.button(this,"本机恢复默认外观",v->{ThemePackStore.deactivate(this);Ui.applyWindow(this);recreate();},false));content.addView(reset);}
    }
    private void syncFromDesktop(){Toast.makeText(this,"正在同步可用装扮包…",Toast.LENGTH_SHORT).show();new Thread(()->{try{int count=ThemePackSync.sync(this);runOnUiThread(()->{Toast.makeText(this,"已同步 "+count+" 个装扮包；当前手机主题保持不变",Toast.LENGTH_SHORT).show();Ui.applyTheme(this);recreate();});}catch(Exception e){runOnUiThread(()->Toast.makeText(this,"同步失败："+(e.getMessage()==null?"请检查电脑连接":e.getMessage()),Toast.LENGTH_LONG).show());}}).start();}
}
