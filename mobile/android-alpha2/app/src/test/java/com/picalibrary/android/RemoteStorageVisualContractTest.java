package com.picalibrary.android;

import static org.junit.Assert.*;

import android.app.Application;
import android.content.Context;
import android.graphics.Color;
import android.view.View;
import android.widget.Spinner;
import android.widget.TextView;
import org.junit.After;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.android.controller.ActivityController;
import org.robolectric.annotation.Config;

/** Presentation-only tests. No remote connection, login or user credentials. */
@RunWith(RobolectricTestRunner.class)
@Config(sdk=35,application=Application.class)
public final class RemoteStorageVisualContractTest {
    @After public void reset(){
        Application app=RuntimeEnvironment.getApplication();
        LocaleStore.set(app,LocaleStore.ZH_CN);
        app.getSharedPreferences("appearance-v1",Context.MODE_PRIVATE)
            .edit().putString("mode",ThemeStore.MODE_LIGHT).commit();
    }

    private void check(String lang,String mode,String heading,String firstVendor){
        Application app=RuntimeEnvironment.getApplication();
        LocaleStore.set(app,lang);
        app.getSharedPreferences("appearance-v1",Context.MODE_PRIVATE)
            .edit().putString("mode",mode).commit();
        try(ActivityController<RemoteStorageActivity> controller=
                Robolectric.buildActivity(RemoteStorageActivity.class).create()){
            RemoteStorageActivity activity=controller.get();
            View root=activity.getWindow().getDecorView();
            TextView title=(TextView)root.findViewWithTag("remote-storage-heading");
            assertNotNull("Remote storage must render its real heading",title);
            assertEquals(heading,title.getText().toString());
            Spinner vendor=(Spinner)root.findViewWithTag(AndroidOnboarding.ADV_REMOTE_VENDOR);
            Spinner targets=(Spinner)root.findViewWithTag(AndroidOnboarding.ADV_REMOTE_TARGET);
            assertNotNull(vendor);
            assertNotNull(targets);
            TextView current=(TextView)vendor.getAdapter().getView(0,null,vendor);
            TextView dropdown=(TextView)vendor.getAdapter().getDropDownView(0,null,vendor);
            assertEquals(firstVendor,current.getText().toString());
            assertEquals(firstVendor,dropdown.getText().toString());
            assertEquals("Spinner must use the app foreground palette",Ui.TEXT,current.getCurrentTextColor());
            assertEquals(Ui.TEXT,dropdown.getCurrentTextColor());
            assertTrue("Dropdown needs at least 44dp height",
                dropdown.getMinHeight()>=Ui.dp(activity,44));
            if(ThemeStore.MODE_DARK.equals(mode)){
                assertTrue("Dark selection must be light enough to read",Color.red(current.getCurrentTextColor())>180);
                assertTrue("Dark dropdown needs light text",Color.red(dropdown.getCurrentTextColor())>180);
            }
            TextView note=(TextView)root.findViewWithTag("remote-storage-provider-note");
            assertNotNull(note);
            assertTrue("Generic WebDAV note must mention HTTPS",
                note.getText().toString().contains("HTTPS"));
        }
    }

    @Test public void englishDarkWebDavUsesReadableLocalizedControls(){
        check(LocaleStore.EN,ThemeStore.MODE_DARK,"Remote storage","Generic WebDAV");
    }

    @Test public void japaneseDarkWebDavUsesReadableLocalizedControls(){
        check(LocaleStore.JA,ThemeStore.MODE_DARK,"リモートストレージ","標準 WebDAV");
    }

    @Test public void chineseLightWebDavRetainsExistingLabels(){
        check(LocaleStore.ZH_CN,ThemeStore.MODE_LIGHT,"远程存储","通用 WebDAV");
    }

    @Test public void everyKnownPresetOffersEnglishGuidanceWithoutChineseFallback(){
        Application app=RuntimeEnvironment.getApplication();
        LocaleStore.set(app,LocaleStore.EN);
        assertTrue("Expected all known WebDAV vendors",RemoteConfigStore.presets().size()>=12);
        for(RemoteConfigStore.Preset preset:RemoteConfigStore.presets()){
            RemoteStoragePresetUi.Copy copy=RemoteStoragePresetUi.forPreset(app,preset);
            for(String displayed:new String[]{copy.label,copy.urlHint,
                    copy.usernameHint,copy.passwordHint,copy.note}){
                assertNotNull(preset.vendor,displayed);
                assertFalse(preset.vendor+" has untranslated visible Chinese: "+displayed,
                    displayed.matches(".*[\\u4E00-\\u9FFF].*"));
            }
            assertEquals("Stable vendor never mutates",preset.vendor,
                RemoteConfigStore.preset(preset.vendor).vendor);
        }
    }
}
