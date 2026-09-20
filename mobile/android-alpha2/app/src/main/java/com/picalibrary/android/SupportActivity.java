package com.picalibrary.android;

import android.app.*;
import android.content.*;
import android.net.Uri;
import android.os.Bundle;
import android.view.Gravity;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Toast;

/** Voluntary project-support links; support never gates product capabilities. */
public final class SupportActivity extends Activity {
    @Override public void onCreate(Bundle saved){super.onCreate(saved);Ui.applyWindow(this);render();}

    private void render(){
        LinearLayout root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);root.setBackgroundColor(Ui.BG);
        root.setOnApplyWindowInsetsListener((v,i)->{v.setPadding(0,i.getSystemWindowInsetTop(),0,i.getSystemWindowInsetBottom());return i;});
        LinearLayout bar=new LinearLayout(this);bar.setGravity(Gravity.CENTER_VERTICAL);bar.setPadding(Ui.dp(this,8),Ui.dp(this,6),Ui.dp(this,8),Ui.dp(this,4));
        bar.addView(Ui.button(this,"‹ 返回",v->finish(),true));
        bar.addView(Ui.text(this,"支持项目",22,Ui.TEXT,true),new LinearLayout.LayoutParams(0,-2,1));
        root.addView(bar);
        ScrollView scroll=new ScrollView(this);
        LinearLayout content=new LinearLayout(this);content.setOrientation(LinearLayout.VERTICAL);content.setPadding(Ui.dp(this,14),Ui.dp(this,12),Ui.dp(this,14),Ui.dp(this,28));
        scroll.addView(content);root.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));

        LinearLayout intro=SettingsRow.panel(this,null);
        intro.addView(Ui.text(this,"支持 Pica Library 的继续开发",17,Ui.TEXT,true));
        intro.addView(Ui.text(this,"Pica Library 免费、开源。如果它对你有帮助，可以通过爱发电自愿支持后续开发、测试和维护。每一份支持都会帮助项目继续改进。",13,Ui.MUTED,false));
        intro.addView(Ui.text(this,"赞助完全自愿，不会解锁额外功能、内容、下载权限或访问权限，也不会影响免费版本的完整使用。",12,Ui.MUTED,false));
        content.addView(intro);

        content.addView(SettingsRow.row(this,"❤ 爱发电支持","支持后续开发与维护",v->open("https://afdian.com/a/PicaLibrary")));
        content.addView(SettingsRow.row(this,"⭐ GitHub 项目主页","Star、反馈问题或参与开发",v->open("https://github.com/Saber-Alter-Lily/pica-library")));
        setContentView(root);root.requestApplyInsets();
    }

    private void open(String url){
        try{startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));}
        catch(Exception e){Toast.makeText(this,"无法打开页面",Toast.LENGTH_SHORT).show();}
    }
}
