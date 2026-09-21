package com.picalibrary.android;

import android.os.Bundle;
import android.view.Gravity;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

/** Explicit app-language selector. Language names stay self-labeled so users can always find their language. */
public final class LanguageActivity extends LocaleAwareActivity {
    private LinearLayout content;

    @Override public void onCreate(Bundle state){
        super.onCreate(state);
        Ui.applyWindow(this);
        render();
    }

    private void render(){
        LinearLayout root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);root.setBackgroundColor(Ui.BG);
        root.setOnApplyWindowInsetsListener((v,i)->{v.setPadding(0,i.getSystemWindowInsetTop(),0,i.getSystemWindowInsetBottom());return i;});
        LinearLayout bar=new LinearLayout(this);bar.setGravity(Gravity.CENTER_VERTICAL);bar.setPadding(Ui.dp(this,8),Ui.dp(this,6),Ui.dp(this,8),Ui.dp(this,4));
        bar.addView(Ui.button(this,getString(R.string.common_back),v->finish(),true));
        bar.addView(Ui.text(this,getString(R.string.language_title),22,Ui.TEXT,true),new LinearLayout.LayoutParams(0,-2,1));
        root.addView(bar);

        ScrollView scroll=new ScrollView(this);
        content=new LinearLayout(this);content.setOrientation(LinearLayout.VERTICAL);content.setPadding(Ui.dp(this,14),Ui.dp(this,8),Ui.dp(this,14),Ui.dp(this,24));
        LinearLayout intro=SettingsRow.panel(this,null);
        intro.addView(Ui.text(this,getString(R.string.language_help),13,Ui.MUTED,false));
        content.addView(intro);
        addLanguage("简体中文",LocaleStore.ZH_CN);
        addLanguage("日本語",LocaleStore.JA);
        addLanguage("English",LocaleStore.EN);
        scroll.addView(content);
        root.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));
        setContentView(root);root.requestApplyInsets();
    }

    private void addLanguage(String label,String code){
        boolean selected=code.equals(LocaleStore.language(this));
        content.addView(SettingsRow.row(this,label,selected?getString(R.string.language_current):"",v->{
            if(LocaleStore.set(this,code)){
                setResult(RESULT_OK);
                recreate();
            }
        }));
    }
}
