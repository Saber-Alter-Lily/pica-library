package com.picalibrary.android;

import android.app.*;
import android.content.*;
import android.os.Bundle;
import android.view.Gravity;
import android.widget.*;

/** Unified account/source management. Desktop pairing mirrors non-secret provider state only. */
public final class AccountSourcesActivity extends LocaleAwareActivity {
    private LinearLayout content;
    private TextView exhState;
    private int probeSerial,desktopSerial;
    private static final String STATE_GUIDE_PREVIEW="guidePreview";
    // The chapter extra is consumed by LocaleAwareActivity.onPostResume. Keep the
    // non-probing state for later resumes and configuration changes.
    private boolean guidePreview;

    @Override public void onCreate(Bundle saved){
        super.onCreate(saved);
        boolean requested=getIntent()!=null
            &&getIntent().getIntExtra(AndroidOnboarding.EXTRA_ADVANCED_CHAPTER,-1)==0;
        guidePreview=saved==null?requested:saved.getBoolean(STATE_GUIDE_PREVIEW,requested);
        Ui.applyWindow(this);
        renderShell();
    }

    @Override protected void onSaveInstanceState(Bundle state){
        state.putBoolean(STATE_GUIDE_PREVIEW,guidePreview);
        super.onSaveInstanceState(state);
    }

    // Read-only, package-scoped contract for guide preview regression tests.
    boolean isGuidePreview(){return guidePreview;}

    @Override protected void onResume(){
        super.onResume();
        renderContent();
        if(!guidePreview)refreshDesktopAccountState();
    }

    @Override protected void onDestroy(){
        probeSerial++;
        desktopSerial++;
        super.onDestroy();
    }

    private void renderShell(){
        LinearLayout root=new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Ui.BG);
        root.setOnApplyWindowInsetsListener((v,i)->{
            v.setPadding(0,i.getSystemWindowInsetTop(),0,i.getSystemWindowInsetBottom());
            return i;
        });
        LinearLayout bar=new LinearLayout(this);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setPadding(Ui.dp(this,8),Ui.dp(this,6),Ui.dp(this,8),Ui.dp(this,4));
        bar.addView(Ui.button(this,getString(R.string.common_back),v->finish(),true));
        TextView heading=Ui.text(this,getString(R.string.account_sources_title),22,Ui.TEXT,true);
        heading.setTag("account-sources-heading");
        heading.setMaxLines(2);
        bar.addView(heading,new LinearLayout.LayoutParams(0,-2,1));
        root.addView(bar);
        ScrollView scroll=new ScrollView(this);
        content=new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(Ui.dp(this,14),Ui.dp(this,12),Ui.dp(this,14),Ui.dp(this,24));
        scroll.addView(content);
        root.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));
        setContentView(root);
        root.requestApplyInsets();
        renderContent();
    }

    private String status(boolean local,boolean desktop){
        if(local)return getString(R.string.account_sources_status_local);
        if(desktop)return getString(R.string.account_sources_status_desktop);
        return getString(R.string.account_sources_status_disconnected);
    }

    private void renderContent(){
        if(content==null)return;
        probeSerial++;
        content.removeAllViews();
        LinearLayout sourceChoices=SettingsRow.row(this,getString(R.string.source_choices_title),getString(R.string.source_choices_summary),v->startActivity(new Intent(this,SourceChoicesActivity.class)));
        sourceChoices.setTag(AndroidOnboarding.ADV_SOURCE_CHOICES);
        content.addView(sourceChoices);
        LinearLayout hostChoices=SettingsRow.row(this,getString(R.string.host_title),getString(R.string.host_entry),v->startActivity(new Intent(this,HostSourceActivity.class)));
        hostChoices.setTag(AndroidOnboarding.ADV_SOURCE_HOST);
        content.addView(hostChoices);

        boolean paired=BridgeStore.paired(this);
        boolean localPica=PicaAccountStore.load(this).configured();
        boolean localEh=EhAccountStore.load(this).configured();
        DesktopAccountStatusStore.Snapshot desktop=paired
            ? DesktopAccountStatusStore.load(this)
            : new DesktopAccountStatusStore.Snapshot(false,false,0L);

        content.addView(SettingsRow.row(
            this,
            "Pica",
            SourceAccessUi.status(this,"pica",status(localPica,desktop.picaConfigured)),
            v->startActivity(new Intent(this,PicaAccountActivity.class))
        ));

        LinearLayout card=SettingsRow.panel(this,v->startActivity(new Intent(this,EhAccountActivity.class)));
        LinearLayout head=new LinearLayout(this);
        head.setGravity(Gravity.CENTER_VERTICAL);
        head.addView(Ui.text(this,"E-Hentai / ExHentai",16,Ui.TEXT,true),new LinearLayout.LayoutParams(0,-2,1));
        head.addView(Ui.text(this,"›",24,Ui.MUTED,false));
        card.addView(head);
        card.addView(SettingsRow.statusLine(
            this,
            getString(R.string.account_sources_eh_account),
            SourceAccessUi.status(this,"eh",status(localEh,desktop.ehConfigured))
        ));

        EhCapabilityStore.Snapshot capability=EhCapabilityStore.load(this);
        String exhLabel=!SourceAccess.enabled(this,"eh")?getString(R.string.source_disabled):localEh
            ? capability.label()
            : desktop.ehConfigured
                ? getString(R.string.account_sources_desktop_provided)
                : capability.label();
        exhState=Ui.text(
            this,
            exhLabel,
            13,
            localEh&&capability.state==EhCapabilityStore.State.AVAILABLE
                ? SettingsRow.statusColor("可用")
                : Ui.MUTED,
            true
        );
        card.addView(SettingsRow.statusLine(this,getString(R.string.account_sources_exh_extension),exhState));
        content.addView(card);

        content.addView(SettingsRow.row(this,"JM",SourceAccessUi.status(this,"jm",getString(R.string.account_sources_jm_description)),v->startActivity(new Intent(this,JmSourceActivity.class))));
        if(paired&&(desktop.picaConfigured||desktop.ehConfigured)){
            TextView note=Ui.text(
                this,
                getString(R.string.account_sources_paired_explanation),
                13,
                Ui.MUTED,
                false
            );
            note.setPadding(Ui.dp(this,4),Ui.dp(this,10),Ui.dp(this,4),Ui.dp(this,6));
            content.addView(note);
        }

        if(localEh&&SourceAccess.enabled(this,"eh")&&!guidePreview)refreshExh();
    }

    private void refreshDesktopAccountState(){
        if(!BridgeStore.paired(this))return;
        final int id=++desktopSerial;
        new Thread(()->{
            try{
                DesktopAccountStatusStore.save(this,BridgeClient.accountStatus(this));
                runOnUiThread(()->{
                    if(id!=desktopSerial||isDestroyed())return;
                    renderContent();
                });
            }catch(Exception ignored){}
        }).start();
    }

    private void refreshExh(){
        final int id=++probeSerial;
        EhCapabilityStore.refreshAsync(this,false,value->{
            if(id!=probeSerial||isDestroyed()||exhState==null)return;
            exhState.setText(value.label());
            exhState.setTextColor(
                value.state==EhCapabilityStore.State.AVAILABLE
                    ? SettingsRow.statusColor("可用")
                    : Ui.MUTED
            );
        });
    }
}
