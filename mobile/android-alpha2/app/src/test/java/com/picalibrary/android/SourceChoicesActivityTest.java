package com.picalibrary.android;

import android.app.Application;
import android.os.Bundle;
import android.os.Looper;
import android.view.View;
import android.widget.*;
import java.util.*;
import org.junit.*;
import org.junit.runner.RunWith;
import org.robolectric.*;
import org.robolectric.android.controller.ActivityController;
import org.robolectric.annotation.*;
import static org.junit.Assert.*;
import static org.robolectric.Shadows.shadowOf;

@RunWith(RobolectricTestRunner.class)
@Config(sdk={28,35},application=Application.class)
@LooperMode(LooperMode.Mode.PAUSED)
public class SourceChoicesActivityTest {
    private ActivityController<SourceChoicesActivity> controller;
    private SourceChoicesActivity activity;
    @Before public void setup(){Assume.assumeFalse(android.os.Build.VERSION.SDK_INT>=31&&System.getProperty("os.name","").startsWith("Windows"));SourceAccess.resetForTests();LocaleStore.set(RuntimeEnvironment.getApplication(),LocaleStore.EN);open(null);}
    private void open(Bundle state){controller=Robolectric.buildActivity(SourceChoicesActivity.class).create(state).start().resume().visible();activity=controller.get();}
    @After public void close(){if(controller!=null){controller.pause().stop().destroy();controller=null;}}
    private View view(String tag){View v=activity.getWindow().getDecorView().findViewWithTag(tag);assertNotNull(tag,v);return v;}
    private void choice(String id,boolean enabled){((CheckBox)view("source."+id)).setChecked(enabled);}
    private String status(){return ((TextView)view("sources.status")).getText().toString();}
    private void await(int message) throws Exception {long end=System.currentTimeMillis()+5000;while(!status().equals(activity.getString(message))&&System.currentTimeMillis()<end){Thread.sleep(10);shadowOf(Looper.getMainLooper()).idle();}assertEquals(activity.getString(message),status());}
    @Test public void checkboxDoesNotAuthorizeUntilExplicitSaveAndSurvivesReopen() throws Exception {
        assertFalse(view("sources.save").isEnabled());choice("jm",true);assertTrue(view("sources.save").isEnabled());assertFalse(SourceAccess.enabled(activity,"jm"));
        view("sources.save").performClick();await(R.string.source_choices_saved);assertTrue(SourceAccess.enabled(activity,"jm"));close();SourceAccess.resetForTests();open(null);assertTrue(((CheckBox)view("source.jm")).isChecked());assertFalse(((CheckBox)view("source.pica")).isChecked());
    }
    @Test public void staleEditorRequiresReloadEvenAfterMoreCheckboxChanges() throws Exception {
        choice("jm",true);SourceAccess.get(activity).save(0,Collections.singleton("pica"));view("sources.save").performClick();await(R.string.source_choices_stale);
        choice("eh",true);assertFalse(view("sources.save").isEnabled());assertFalse(SourceAccess.enabled(activity,"jm"));
        view("sources.reload").performClick();assertTrue(((CheckBox)view("source.pica")).isChecked());assertFalse(((CheckBox)view("source.jm")).isChecked());assertEquals(activity.getString(R.string.source_choices_current),status());
    }
    @Test public void unsavedDraftSurvivesRecreationWithoutEnablingSource(){
        choice("eh",true);Bundle state=new Bundle();controller.saveInstanceState(state);close();open(state);assertTrue(((CheckBox)view("source.eh")).isChecked());assertTrue(view("sources.save").isEnabled());assertFalse(SourceAccess.enabled(activity,"eh"));
    }
    @Test public void allSupportedLanguagesHaveAUsableSourceChoiceScreen(){
        for(String locale:new String[]{LocaleStore.ZH_CN,LocaleStore.EN,LocaleStore.JA}){
            close();LocaleStore.set(RuntimeEnvironment.getApplication(),locale);open(null);assertFalse(activity.getString(R.string.source_choices_title).isEmpty());assertFalse(activity.getString(R.string.source_disabled).isEmpty());assertEquals(3,com.picalibrary.android.sources.SourceAccessPolicy.IDS.size());
        }
    }
}
