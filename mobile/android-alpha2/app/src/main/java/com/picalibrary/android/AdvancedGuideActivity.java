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
        LinearLayout bar=new LinearLayout(this);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setPadding(Ui.dp(this,6),Ui.dp(this,4),Ui.dp(this,8),Ui.dp(this,4));
        bar.addView(Ui.button(this,getString(R.string.common_back),v->finish(),true));
        TextView heading=Ui.text(this,getString(R.string.advanced_guide_title),21,Ui.TEXT,true);
        heading.setMaxLines(2);
        bar.addView(heading,new LinearLayout.LayoutParams(0,-2,1));
        root.addView(bar);
        ScrollView scroll=new ScrollView(this);LinearLayout content=new LinearLayout(this);content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(Ui.dp(this,14),Ui.dp(this,8),Ui.dp(this,14),Ui.dp(this,24));
        TextView shortSafety=Ui.text(this,getString(R.string.advanced_guide_safety_short),13,Ui.MUTED,false);
        shortSafety.setTag("advanced-guide-safety-short");
        content.addView(shortSafety);
        TextView progress=Ui.text(this,getString(R.string.advanced_guide_progress,chapter+1,titles.length,displayedRead.size()),13,Ui.MUTED,false);
        progress.setTag("advanced-guide-progress");
        content.addView(progress);
        String[] chapterLabels=titles.clone();for(int i=0;i<chapterLabels.length;i++)if(displayedRead.contains(String.valueOf(i)))chapterLabels[i]="✓ "+chapterLabels[i];
        Spinner chapters=new Spinner(this);
        chapters.setTag("advanced-guide-chapters");
        android.widget.ArrayAdapter<String> adapter=Ui.spinnerAdapter(this,java.util.Arrays.asList(chapterLabels));
        chapters.setAdapter(adapter);
        chapters.setSelection(chapter);
        content.addView(chapters);
        chapters.setOnItemSelectedListener(new android.widget.AdapterView.OnItemSelectedListener(){
            @Override public void onItemSelected(android.widget.AdapterView<?> parent,android.view.View view,int position,long id){if(position!=chapter){chapter=position;OnboardingStore.advancedPosition(AdvancedGuideActivity.this,chapter);render();}}
            @Override public void onNothingSelected(android.widget.AdapterView<?> parent){}
        });
        // The Spinner already names the selected chapter; do not repeat its title.
        // Make the actual spotlight action primary and keep full help available below.
        content.addView(Ui.text(this,getString(R.string.advanced_guide_interactive_hint_short),13,Ui.MUTED,false));
        Button open=Ui.button(this,getString(R.string.advanced_guide_start_interactive),v->{
            Intent destination=new Intent(this,DESTINATIONS[chapter]);
            if(chapter==2)destination.putExtra("startDetailedOnboarding",true);
            else destination.putExtra(AndroidOnboarding.EXTRA_ADVANCED_CHAPTER,chapter);
            startActivity(destination);
        },false);
        open.setTag("advanced-guide-open");
        open.setBackground(Ui.rounded(Ui.PRIMARY_SOFT,14,this));
        open.setTextColor(Ui.PRIMARY);
        content.addView(open,new LinearLayout.LayoutParams(-1,-2));
        LinearLayout article=SettingsRow.panel(this,null);
        TextView fullSafety=Ui.text(this,getString(R.string.advanced_guide_safety),13,Ui.MUTED,false);
        fullSafety.setTag("advanced-guide-safety-long");
        article.addView(fullSafety);
        article.addView(Ui.text(this,getString(R.string.advanced_guide_interactive_hint),13,Ui.MUTED,false));
        article.addView(Ui.text(this,actions[chapter],13,Ui.MUTED,false));
        TextView body=Ui.text(this,bodies[chapter],15,Ui.TEXT,false);
        body.setTextIsSelectable(true);
        body.setTag("advanced-guide-body");
        article.addView(body);
        article.setVisibility(android.view.View.GONE);
        Button notes=Ui.button(this,getString(R.string.advanced_guide_notes_show),v->{
            boolean expand=article.getVisibility()!=android.view.View.VISIBLE;
            article.setVisibility(expand?android.view.View.VISIBLE:android.view.View.GONE);
            ((Button)v).setText(expand?R.string.advanced_guide_notes_hide:R.string.advanced_guide_notes_show);
        },true);
        notes.setTag("advanced-guide-notes-toggle");
        content.addView(notes,new LinearLayout.LayoutParams(-1,-2));
        content.addView(article);
        LinearLayout nav=new LinearLayout(this);nav.setOrientation(LinearLayout.HORIZONTAL);
        Button previous=Ui.button(this,getString(R.string.onboarding_back),v->{if(chapter>0){chapter--;OnboardingStore.advancedPosition(this,chapter);render();}},true);
        previous.setEnabled(chapter>0);
        previous.setAlpha(chapter>0?1f:0.55f);
        nav.addView(previous,new LinearLayout.LayoutParams(0,-2,1));
        Ui.gap(nav,this,8);
        Button next=Ui.button(this,getString(R.string.advanced_guide_read_next),v->{
            OnboardingStore.markAdvancedRead(this,chapter);
            if(chapter<titles.length-1){chapter++;OnboardingStore.advancedPosition(this,chapter);render();}
            else {render();Toast.makeText(this,getString(R.string.advanced_guide_read_notice),Toast.LENGTH_LONG).show();}
        },false);next.setTag("advanced-guide-read-next");nav.addView(next,new LinearLayout.LayoutParams(0,-2,1));content.addView(nav);
        scroll.addView(content);root.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));setContentView(root);root.requestApplyInsets();
    }
}
