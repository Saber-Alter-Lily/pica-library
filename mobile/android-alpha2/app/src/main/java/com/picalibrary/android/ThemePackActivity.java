package com.picalibrary.android;

import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

/** Account-authenticated theme selector. Theme packs sync from Desktop; active choice stays local. */
public final class ThemePackActivity extends Activity {
    private LinearLayout content;
    private boolean authInProgress=false;

    @Override public void onCreate(Bundle saved){super.onCreate(saved);Ui.applyWindow(this);render();}

    @Override protected void onResume(){
        super.onResume();
        Ui.applyWindow(this);
        if(content!=null&&!authInProgress)renderList();
    }

    private void render(){
        LinearLayout root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);root.setBackgroundColor(Ui.BG);
        root.setOnApplyWindowInsetsListener((v,i)->{v.setPadding(0,i.getSystemWindowInsetTop(),0,i.getSystemWindowInsetBottom());return i;});
        LinearLayout bar=new LinearLayout(this);bar.setGravity(Gravity.CENTER_VERTICAL);bar.addView(Ui.button(this,"‹ 返回",v->finish(),true));bar.addView(Ui.text(this,"个性化装扮",22,Ui.TEXT,true),new LinearLayout.LayoutParams(0,-2,1));root.addView(bar);
        ScrollView scroll=new ScrollView(this);scroll.setBackgroundColor(Ui.BG);content=new LinearLayout(this);content.setOrientation(LinearLayout.VERTICAL);content.setPadding(Ui.dp(this,8),Ui.dp(this,6),Ui.dp(this,8),Ui.dp(this,24));scroll.addView(content);root.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));setContentView(root);root.requestApplyInsets();renderList();
    }

    private void renderList(){
        content.removeAllViews();
        if(!StarAccessStore.enabled(this)){
            LinearLayout unlock=Ui.card(this);
            unlock.addView(Ui.text(this,"GitHub Star 验证",18,Ui.TEXT,true));
            unlock.addView(Ui.text(this,"验证本人 GitHub 账号后解锁装扮",13,Ui.MUTED,false));

            TextView code=Ui.text(this,"先生成验证码，再打开 GitHub。",13,Ui.MUTED,false);
            code.setPadding(0,Ui.dp(this,8),0,Ui.dp(this,8));
            unlock.addView(code);

            Button copy=Ui.button(this,"复制验证码",v->{},true);copy.setVisibility(View.GONE);
            Button open=Ui.button(this,"打开 GitHub",v->{},false);open.setVisibility(View.GONE);

            Button verify=Ui.button(this,"生成 GitHub 验证码",v->{
                Button button=(Button)v;
                button.setEnabled(false);
                authInProgress=true;
                code.setText("正在生成验证码…");
                GitHubAccountAuth.start(this,new GitHubAccountAuth.Callback(){
                    public void code(String userCode,String uri){
                        code.setText("验证码："+userCode+"\n授权完成后返回本页即可。");
                        copy.setVisibility(View.VISIBLE);
                        open.setVisibility(View.VISIBLE);
                        copy.setOnClickListener(x->copyCode(userCode));
                        open.setOnClickListener(x->{copyCode(userCode);try{startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse(uri)));}catch(Exception e){Toast.makeText(ThemePackActivity.this,"无法打开 GitHub",Toast.LENGTH_LONG).show();}});
                    }
                    public void done(boolean ok,String message){
                        authInProgress=false;
                        button.setEnabled(true);
                        boolean unlocked=ok&&StarAccessStore.enabled(ThemePackActivity.this);
                        Toast.makeText(ThemePackActivity.this,unlocked?message:"验证未完成",unlocked?Toast.LENGTH_SHORT:Toast.LENGTH_LONG).show();
                        code.setText(unlocked?"验证成功":message);
                        if(unlocked){Ui.applyTheme(ThemePackActivity.this);recreate();}
                    }
                });
            },false);
            unlock.addView(verify);
            unlock.addView(copy);
            unlock.addView(open);

            unlock.addView(Ui.button(this,"⭐ 打开项目页面",v->{try{startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse(StarAccessStore.REPOSITORY_URL)));}catch(Exception ignored){}},true));
            if(BridgeStore.paired(this))unlock.addView(Ui.button(this,"从电脑同步已验证账号",v->syncFromDesktop(),true));
            content.addView(unlock);
            return;
        }

        LinearLayout identity=Ui.card(this);identity.addView(Ui.text(this,"已验证 · "+StarAccessStore.user(this),18,Ui.TEXT,true));content.addView(identity);
        LinearLayout sync=Ui.card(this);sync.addView(Ui.text(this,"装扮包同步",18,Ui.TEXT,true));sync.addView(Ui.text(this,"只同步装扮包；本机主题独立选择",13,Ui.MUTED,false));if(BridgeStore.paired(this))sync.addView(Ui.button(this,"从电脑同步装扮包",v->syncFromDesktop(),false));content.addView(sync);

        String active=ThemePackStore.activeId(this);
        for(ThemePackStore.Pack pack:ThemePackStore.list(this)){
            LinearLayout card=Ui.card(this);LinearLayout row=new LinearLayout(this);row.setGravity(Gravity.CENTER_VERTICAL);row.addView(Ui.text(this,pack.name,17,Ui.TEXT,true),new LinearLayout.LayoutParams(0,-2,1));if(pack.id.equals(active))row.addView(Ui.pill(this,"本机使用中",Ui.GOOD_SOFT,Ui.GOOD));card.addView(row);card.addView(Ui.text(this,pack.author+" · "+pack.version,12,Ui.MUTED,false));Button use=Ui.button(this,pack.id.equals(active)?"本机已启用":"在本机使用",v->{if(!StarAccessStore.enabled(this)){Toast.makeText(this,"请先完成 GitHub 验证",Toast.LENGTH_LONG).show();return;}ThemePackStore.activate(this,pack.id);Ui.applyWindow(this);Toast.makeText(this,"已在本机应用",Toast.LENGTH_SHORT).show();recreate();},false);use.setEnabled(!pack.id.equals(active));card.addView(use);content.addView(card);
        }
        if(!active.isEmpty()){LinearLayout reset=Ui.card(this);reset.addView(Ui.button(this,"恢复默认外观",v->{ThemePackStore.deactivate(this);Ui.applyWindow(this);recreate();},false));content.addView(reset);}
    }

    private void copyCode(String value){
        ClipboardManager clipboard=getSystemService(ClipboardManager.class);
        if(clipboard!=null){clipboard.setPrimaryClip(ClipData.newPlainText("GitHub device code",value));Toast.makeText(this,"验证码已复制",Toast.LENGTH_SHORT).show();}
    }

    private void syncFromDesktop(){Toast.makeText(this,"正在同步…",Toast.LENGTH_SHORT).show();new Thread(()->{try{int count=ThemePackSync.sync(this);runOnUiThread(()->{Toast.makeText(this,"已同步 "+count+" 个装扮包",Toast.LENGTH_SHORT).show();Ui.applyTheme(this);recreate();});}catch(Exception e){runOnUiThread(()->Toast.makeText(this,"同步失败："+(e.getMessage()==null?"请检查电脑连接":e.getMessage()),Toast.LENGTH_LONG).show());}}).start();}
}
