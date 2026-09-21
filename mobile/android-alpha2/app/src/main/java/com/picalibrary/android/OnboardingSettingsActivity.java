package com.picalibrary.android;

import android.content.Intent;
import android.os.Bundle;
import android.view.Gravity;
import android.widget.CheckBox;
import android.widget.LinearLayout;
import android.widget.ScrollView;

/** Manual onboarding replay and automatic-prompt preference. */
public final class OnboardingSettingsActivity extends LocaleAwareActivity {
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
        bar.addView(Ui.text(this,getString(R.string.onboarding_settings_title),22,Ui.TEXT,true),new LinearLayout.LayoutParams(0,-2,1));
        root.addView(bar);

        ScrollView scroll=new ScrollView(this);
        LinearLayout content=new LinearLayout(this);content.setOrientation(LinearLayout.VERTICAL);content.setPadding(Ui.dp(this,14),Ui.dp(this,8),Ui.dp(this,14),Ui.dp(this,24));

        LinearLayout info=SettingsRow.panel(this,null);
        info.addView(Ui.text(this,getString(R.string.onboarding_settings_help),13,Ui.MUTED,false));
        content.addView(info);

        content.addView(SettingsRow.row(this,getString(R.string.onboarding_replay),getString(R.string.onboarding_replay_summary),v->{
            OnboardingStore.replay();
            Intent intent=new Intent(this,HomeActivity.class);
            intent.putExtra("startOnboarding",true);
            intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP|Intent.FLAG_ACTIVITY_SINGLE_TOP);
            startActivity(intent);
            finish();
        }));

        CheckBox automatic=new CheckBox(this);
        automatic.setText(getString(R.string.onboarding_auto));
        automatic.setTextColor(Ui.TEXT);
        automatic.setChecked(OnboardingStore.autoShow(this));
        automatic.setPadding(Ui.dp(this,12),Ui.dp(this,12),Ui.dp(this,12),Ui.dp(this,12));
        automatic.setOnCheckedChangeListener((button,checked)->OnboardingStore.setAutoShow(this,checked));
        LinearLayout box=SettingsRow.panel(this,null);box.addView(automatic);content.addView(box);

        scroll.addView(content);root.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));
        setContentView(root);root.requestApplyInsets();
    }
}
