package com.picalibrary.android;

import android.content.Intent;
import android.os.Bundle;
import android.view.Gravity;
import android.widget.*;
import java.util.Set;

/** Offline, opt-in chapter guide. Opening a chapter performs no provider/model task. */
public final class AdvancedGuideActivity extends LocaleAwareActivity {
    private int chapter;
    private Set<String> displayedRead=java.util.Collections.emptySet();
    private static final Class<?>[] DESTINATIONS={AccountSourcesActivity.class,RecommendationControlActivity.class,
        RecommendationStyleActivity.class,PairingActivity.class,RemoteStorageActivity.class,
        DownloadsActivity.class,RecommendationProfileActivity.class,UpdateActivity.class};

    @Override public void onCreate(Bundle state){
        super.onCreate(state);Ui.applyWindow(this);
        chapter=Math.max(0,Math.min(7,state==null?OnboardingStore.advancedPosition(this):state.getInt("guideChapter",0)));
        render();
    }
    @Override protected void onResume(){
        super.onResume();
        // A completed spotlight writes the shared guide store in its destination Activity.
        // Refresh the visible chapter count on return, without advancing or changing user settings.
        if(!OnboardingStore.advancedRead(this).equals(displayedRead))render();
    }
    @Override protected void onSaveInstanceState(Bundle out){out.putInt("guideChapter",chapter);super.onSaveInstanceState(out);}

    private void render(){
        displayedRead=OnboardingStore.advancedRead(this);
        String[] titles=getResources().getStringArray(R.array.advanced_guide_titles);
        String[] bodies=getResources().getStringArray(R.array.advanced_guide_bodies);
        String[] actions=getResources().getStringArray(R.array.advanced_guide_actions);
        LinearLayout root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);root.setBackgroundColor(Ui.BG);
        root.setOnApplyWindowInsetsListener((v,i)->{v.setPadding(0,i.getSystemWindowInsetTop(),0,i.getSystemWindowInsetBottom());return i;});
        LinearLayout bar=new LinearLayout(this);bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.addView(Ui.button(this,getString(R.string.common_back),v->finish(),true));
        bar.addView(Ui.text(this,getString(R.string.advanced_guide_title),21,Ui.TEXT,true),new LinearLayout.LayoutParams(0,-2,1));root.addView(bar);
        ScrollView scroll=new ScrollView(this);LinearLayout content=new LinearLayout(this);content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(Ui.dp(this,14),Ui.dp(this,8),Ui.dp(this,14),Ui.dp(this,24));
        content.addView(Ui.text(this,getString(R.string.advanced_guide_safety),13,Ui.MUTED,false));
        TextView progress=Ui.text(this,getString(R.string.advanced_guide_progress,chapter+1,titles.length,displayedRead.size()),13,Ui.MUTED,false);
        progress.setTag("advanced-guide-progress");
        content.addView(progress);
        String[] chapterLabels=titles.clone();for(int i=0;i<chapterLabels.length;i++)if(displayedRead.contains(String.valueOf(i)))chapterLabels[i]="✓ "+chapterLabels[i];
        Spinner chapters=new Spinner(this);ArrayAdapter<String> adapter=new ArrayAdapter<>(this,android.R.layout.simple_spinner_item,chapterLabels);adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);chapters.setAdapter(adapter);chapters.setSelection(chapter);content.addView(chapters);
        chapters.setOnItemSelectedListener(new android.widget.AdapterView.OnItemSelectedListener(){
            @Override public void onItemSelected(android.widget.AdapterView<?> parent,android.view.View view,int position,long id){if(position!=chapter){chapter=position;OnboardingStore.advancedPosition(AdvancedGuideActivity.this,chapter);render();}}
            @Override public void onNothingSelected(android.widget.AdapterView<?> parent){}
        });
        LinearLayout article=SettingsRow.panel(this,null);
        article.addView(Ui.text(this,titles[chapter],20,Ui.TEXT,true));
        TextView body=Ui.text(this,bodies[chapter],15,Ui.TEXT,false);body.setTextIsSelectable(true);body.setTag("advanced-guide-body");article.addView(body);content.addView(article);
        content.addView(Ui.text(this,getString(R.string.advanced_guide_interactive_hint),13,Ui.MUTED,false));
        // Keep a chapter-specific destination label alongside a clear "start interactive" action.
        content.addView(Ui.text(this,actions[chapter],13,Ui.MUTED,false));
        // An explicit advanced chapter opens the actual feature page and highlights tagged controls.
        // Chapter 2 keeps the existing five-step Visual tour. Guide entry itself never invokes business actions.
        Button open=Ui.button(this,getString(R.string.advanced_guide_start_interactive),v->{
            Intent destination=new Intent(this,DESTINATIONS[chapter]);
            if(chapter==2)destination.putExtra("startDetailedOnboarding",true);
            else destination.putExtra(AndroidOnboarding.EXTRA_ADVANCED_CHAPTER,chapter);
            startActivity(destination);
        },true);open.setTag("advanced-guide-open");content.addView(open,new LinearLayout.LayoutParams(-1,-2));
        LinearLayout nav=new LinearLayout(this);nav.setOrientation(LinearLayout.HORIZONTAL);
        Button previous=Ui.button(this,getString(R.string.onboarding_back),v->{if(chapter>0){chapter--;OnboardingStore.advancedPosition(this,chapter);render();}},true);previous.setEnabled(chapter>0);nav.addView(previous,new LinearLayout.LayoutParams(0,-2,1));
        Button next=Ui.button(this,getString(R.string.advanced_guide_read_next),v->{
            OnboardingStore.markAdvancedRead(this,chapter);
            if(chapter<titles.length-1){chapter++;OnboardingStore.advancedPosition(this,chapter);render();}
            else {render();Toast.makeText(this,getString(R.string.advanced_guide_read_notice),Toast.LENGTH_LONG).show();}
        },false);next.setTag("advanced-guide-read-next");nav.addView(next,new LinearLayout.LayoutParams(0,-2,1));content.addView(nav);
        scroll.addView(content);root.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));setContentView(root);root.requestApplyInsets();
    }
}
