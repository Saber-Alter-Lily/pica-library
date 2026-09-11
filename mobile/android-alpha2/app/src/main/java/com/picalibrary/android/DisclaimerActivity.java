package com.picalibrary.android;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.view.Gravity;
import android.widget.*;

/** First-launch/versioned open-source disclaimer gate. */
public final class DisclaimerActivity extends Activity {
    private static final String PREF="pica-disclaimer-v1",KEY_VERSION="accepted_version",VERSION="1";

    static boolean accepted(Activity activity){
        return VERSION.equals(activity.getSharedPreferences(PREF,MODE_PRIVATE).getString(KEY_VERSION,""));
    }

    static void requireBeforePairing(Activity activity,Intent original){
        if(accepted(activity))return;
        Intent gate=new Intent(activity,DisclaimerActivity.class);
        gate.putExtra("next","pair");
        if(original!=null&&original.getData()!=null)gate.putExtra("nextData",original.getData().toString());
        activity.startActivity(gate);activity.finish();
    }

    @Override public void onCreate(Bundle saved){
        super.onCreate(saved);Ui.applyWindow(this);
        if(accepted(this)){continueIntoApp();return;}
        render();
    }

    private void render(){
        ScrollView scroll=new ScrollView(this);
        scroll.setBackgroundColor(Ui.BG);
        scroll.setFillViewport(true);
        scroll.setClipToPadding(false);
        // Ui.applyWindow enables edge-to-edge drawing. Reserve the actual
        // status-bar/notch and navigation-bar insets here so the disclaimer
        // title never overlaps system UI on phones with cutouts or gesture bars.
        scroll.setOnApplyWindowInsetsListener((v,insets)->{
            v.setPadding(0,insets.getSystemWindowInsetTop(),0,insets.getSystemWindowInsetBottom());
            return insets;
        });

        LinearLayout root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);root.setPadding(Ui.dp(this,20),Ui.dp(this,26),Ui.dp(this,20),Ui.dp(this,28));
        root.addView(Ui.text(this,"Pica Library · 开源工具使用提示",13,Ui.PRIMARY,true));
        root.addView(Ui.text(this,"使用提示与免责声明",25,Ui.TEXT,true));
        TextView lead=Ui.text(this,"Pica Library 是开源、本地优先的个人数字内容管理工具。继续前请确认你理解以下边界。",14,Ui.MUTED,false);lead.setPadding(0,Ui.dp(this,8),0,Ui.dp(this,12));root.addView(lead);
        String[] items={
            "非官方关系：除非另有明确说明，本项目与 Pica 内容服务、GitHub 及第三方内容提供者不存在隶属、代理、授权、背书或担保关系。",
            "授权与合规：请自行确保账号使用、内容访问、下载、保存、阅读与备份符合所在地法律法规、平台条款以及版权或其他授权范围。",
            "不提供内容资源：Pica Library 本身不销售、托管或重新分发漫画内容，只在你主动配置且有权访问的数据源上工作。",
            "禁止未经授权的再分发：请勿利用本软件传播、公开分享或重新分发你无权传播的内容。",
            "第三方服务：网络、GitHub API、内容平台、代理和 WebDAV 可能变更、限流、中断或失效，本项目不保证其持续可用。",
            "本地数据：收藏数据库、下载内容和阅读进度主要保存在你的设备上，请自行负责设备安全、磁盘空间和必要备份。"
        };
        for(int i=0;i<items.length;i++){
            TextView item=Ui.text(this,(i+1)+". "+items[i],13.5f,Ui.TEXT,false);item.setLineSpacing(0,1.15f);item.setPadding(0,Ui.dp(this,6),0,Ui.dp(this,6));root.addView(item);
        }
        CheckBox confirm=new CheckBox(this);confirm.setText("我已阅读并理解上述提示，并确认只访问、下载和使用我有权访问或使用的内容。");confirm.setTextColor(Ui.TEXT);confirm.setTextSize(13.5f);confirm.setPadding(0,Ui.dp(this,14),0,Ui.dp(this,10));root.addView(confirm);
        Button accept=Ui.button(this,"同意并继续",v->{getSharedPreferences(PREF,MODE_PRIVATE).edit().putString(KEY_VERSION,VERSION).apply();continueIntoApp();},false);accept.setEnabled(false);confirm.setOnCheckedChangeListener((button,checked)->accept.setEnabled(checked));root.addView(accept);
        Button exit=Ui.button(this,"不同意并退出",v->finishAndRemoveTask(),true);LinearLayout.LayoutParams ep=new LinearLayout.LayoutParams(-1,-2);ep.setMargins(0,Ui.dp(this,8),0,0);root.addView(exit,ep);
        TextView note=Ui.text(this,"本确认仅记录在当前设备；免责声明版本更新后会再次提示。",12,Ui.MUTED,false);note.setGravity(Gravity.CENTER);note.setPadding(0,Ui.dp(this,14),0,0);root.addView(note);
        scroll.addView(root);setContentView(scroll);scroll.requestApplyInsets();
    }

    private void continueIntoApp(){
        String next=getIntent().getStringExtra("next");
        if("pair".equals(next)){
            Intent pair=new Intent(this,PairingActivity.class);String data=getIntent().getStringExtra("nextData");if(data!=null&&!data.isEmpty())pair.setData(android.net.Uri.parse(data));startActivity(pair);
        }else startActivity(new Intent(this,HomeActivity.class));
        finish();
    }
}
