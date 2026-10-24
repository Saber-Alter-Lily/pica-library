package com.picalibrary.android;

import android.os.Bundle;
import android.view.View;
import android.widget.*;
import com.picalibrary.android.sources.SourceAccessPolicy;
import java.util.*;

/** Phone-local opt-in. Reading/sync of already-owned content is not a provider capability. */
public final class SourceChoicesActivity extends LocaleAwareActivity {
    private final Map<String,CheckBox> fields=new LinkedHashMap<>();
    private SourceAccessPolicy.Snapshot baseline;
    private TextView status;
    private Button save,reload;
    private boolean busy,needsReload;
    @Override public void onCreate(Bundle state){
        super.onCreate(state);Ui.applyWindow(this);
        LinearLayout root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);root.setBackgroundColor(Ui.BG);
        root.setPadding(Ui.dp(this,16),0,Ui.dp(this,16),0);
        root.setOnApplyWindowInsetsListener((v,i)->{v.setPadding(Ui.dp(this,16),i.getSystemWindowInsetTop(),Ui.dp(this,16),i.getSystemWindowInsetBottom());return i;});
        root.addView(Ui.button(this,getString(R.string.common_back),v->finish(),true));
        root.addView(Ui.rawText(this,getString(R.string.source_choices_title),22,Ui.TEXT,true));
        root.addView(Ui.rawText(this,getString(R.string.source_choices_help),14,Ui.MUTED,false));
        for(String id:SourceAccessPolicy.IDS){CheckBox field=new CheckBox(this);field.setTag("source."+id);field.setText("eh".equals(id)?"E-H / ExH":"jm".equals(id)?"JM":"Pica");field.setTextColor(Ui.TEXT);field.setOnCheckedChangeListener((button,checked)->dirty());root.addView(field);fields.put(id,field);}
        status=Ui.rawText(this,"",14,Ui.MUTED,false);status.setTag("sources.status");status.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);root.addView(status);
        reload=Ui.button(this,getString(R.string.source_choices_reload),v->read(),true);reload.setTag("sources.reload");root.addView(reload);
        save=Ui.button(this,getString(R.string.source_choices_save),v->save(),false);save.setTag("sources.save");root.addView(save);
        ScrollView scroll=new ScrollView(this);scroll.addView(root);setContentView(scroll);root.requestApplyInsets();read();
        if(state!=null&&state.containsKey("draftRevision")){
            if(state.getLong("draftRevision")==baseline.revision){ArrayList<String> draft=state.getStringArrayList("draftSources");if(draft!=null){for(String id:fields.keySet())fields.get(id).setChecked(draft.contains(id));dirty();}}
            else{needsReload=true;save.setEnabled(false);status.setText(R.string.source_choices_stale);}
        }
    }
    @Override protected void onSaveInstanceState(Bundle state){super.onSaveInstanceState(state);if(baseline!=null&&!busy){state.putLong("draftRevision",baseline.revision);state.putStringArrayList("draftSources",new ArrayList<>(choices()));}}
    private Set<String> choices(){Set<String> out=new LinkedHashSet<>();for(Map.Entry<String,CheckBox> e:fields.entrySet())if(e.getValue().isChecked())out.add(e.getKey());return out;}
    private void dirty(){if(save==null||baseline==null||busy||needsReload)return;boolean changed=!choices().equals(baseline.enabled);save.setEnabled(changed);status.setText(changed?R.string.source_choices_unsaved:R.string.source_choices_current);}
    private void read(){if(busy)return;SourceAccess access=SourceAccess.get(this);needsReload=false;baseline=access.snapshot();for(String id:fields.keySet())fields.get(id).setChecked(baseline.enabled.contains(id));dirty();if(!access.loadError().isEmpty()){needsReload=true;save.setEnabled(false);status.setText(R.string.source_choices_storage_error);}}
    private void save(){
        if(busy||needsReload||baseline==null)return;busy=true;save.setEnabled(false);reload.setEnabled(false);for(CheckBox field:fields.values())field.setEnabled(false);
        long revision=baseline.revision;Set<String> next=choices();
        new Thread(()->{
            int message=R.string.source_choices_saved;
            try{SourceAccess.get(this).save(revision,next);}
            catch(SourceAccessPolicy.Stale stale){message=R.string.source_choices_stale;}
            catch(Exception error){message=R.string.source_choices_storage_error;}
            final int result=message;
            runOnUiThread(()->{if(isDestroyed())return;busy=false;reload.setEnabled(true);for(CheckBox field:fields.values())field.setEnabled(true);if(result==R.string.source_choices_saved)read();else {needsReload=true;save.setEnabled(false);}status.setText(result);});
        },"source-choice-save").start();
    }
}
