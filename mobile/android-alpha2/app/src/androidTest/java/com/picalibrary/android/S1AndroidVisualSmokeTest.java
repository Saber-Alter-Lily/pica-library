package com.picalibrary.android;

import static org.junit.Assert.*;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.os.SystemClock;
import android.view.View;
import android.view.ViewGroup;

import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.junit.Test;
import org.junit.runner.RunWith;

import java.io.File;
import java.io.FileOutputStream;
import java.util.Locale;

/**
 * Synthetic/fresh-emulator S1 visual evidence only.
 * Never signs in, imports real comics, contacts a source, or manipulates user data.
 * An emulator screenshot is NOT physical/OEM/maintainer acceptance.
 */
@RunWith(AndroidJUnit4.class)
public final class S1AndroidVisualSmokeTest {
    private static final String DIRECTORY="s1-visual";

    private Context app(){
        return InstrumentationRegistry.getInstrumentation().getTargetContext().getApplicationContext();
    }

    private void prepare(){
        Context app=app();
        // Suppress first-launch prompts and background automatic release checks in the disposable emulator.
        app.getSharedPreferences("pica-disclaimer-v1",Context.MODE_PRIVATE)
            .edit().putString("accepted_version","1").commit();
        app.getSharedPreferences("updater-v1",Context.MODE_PRIVATE)
            .edit().putLong("lastAutoCheckAt",System.currentTimeMillis())
            .putInt("latestVersionCode",-1).commit();
        OnboardingStore.setAutoShow(app,false);
    }

    private void capture(String lang,String theme,Class<? extends Activity> screen,String page,
                         boolean selection,boolean preview) throws Exception {
        Context context=app();
        LocaleStore.set(context,lang);
        ThemeStore.setMode(context,theme);
        Intent intent=new Intent(context,screen);
        if(preview) intent.putExtra(AndroidOnboarding.EXTRA_ADVANCED_CHAPTER,7);

        try(ActivityScenario<? extends Activity> scenario=ActivityScenario.launch(intent)){
            Instrumentation inst=InstrumentationRegistry.getInstrumentation();
            inst.waitForIdleSync();
            scenario.onActivity(activity->{
                if(selection && activity instanceof HomeActivity)
                    ((HomeActivity)activity).onCollectionSelectionStateChanged(true,3,false);
                View root=activity.getWindow().getDecorView();
                assertTrue("No rendered root for "+page,root.getWidth()>0);
                if(screen==AdvancedGuideActivity.class){
                    assertNotNull("Missing interactive CTA",root.findViewWithTag("advanced-guide-open"));
                    View notes=root.findViewWithTag("advanced-guide-body");
                    assertNotNull("Missing reference notes",notes);
                    assertEquals("Guide notes should be initially collapsed",View.GONE,
                        ((View)notes.getParent()).getVisibility());
                }
                if(screen==TagParticipationActivity.class)
                    assertNotNull("Missing tag heading",root.findViewWithTag("tag-participation-heading"));
                if(screen==UpdateActivity.class){
                    View status=root.findViewWithTag(AndroidOnboarding.ADV_UPDATE_STATUS);
                    assertNotNull("Missing update status",status);
                    assertEquals("Guide update preview must not start a check",
                        activity.getString(R.string.advanced_guide_update_preview),
                        ((android.widget.TextView)status).getText().toString());
                }
                if(selection){
                    View bar=root.findViewWithTag("s1.collection.action.bar");
                    assertNotNull("Missing five-action selection bar",bar);
                }
            });
            inst.waitForIdleSync();
            SystemClock.sleep(200);
            Bitmap image=inst.getUiAutomation().takeScreenshot();
            assertNotNull("Unable to capture screenshot for "+page,image);
            try {
                assertTrue("Screenshot width too small",image.getWidth()>=320);
                assertTrue("Screenshot height too small",image.getHeight()>=500);
                File dir=context.getExternalFilesDir(DIRECTORY);
                assertNotNull("No scoped screenshot directory",dir);
                assertTrue(dir.isDirectory()||dir.mkdirs());
                String safe=lang.replace("-","")+"-"+theme+"-"+page+".png";
                File destination=new File(dir,safe);
                try(FileOutputStream out=new FileOutputStream(destination)){
                    assertTrue("PNG encode failed",image.compress(Bitmap.CompressFormat.PNG,100,out));
                    out.getFD().sync();
                }
                assertTrue("Screenshot empty: "+safe,destination.length()>500);
            }finally{image.recycle();}
        }
    }

    @Test public void captureFreshEmulatorLanguagesAndThemesWithoutSourceAccounts() throws Exception {
        prepare();
        String expected=InstrumentationRegistry.getArguments().getString("expectedFontScale");
        if(expected!=null&&!expected.isEmpty()){
            float actual=app().getResources().getConfiguration().fontScale;
            assertEquals("The screenshot must use the requested Android font scale",
                    Float.parseFloat(expected),actual,0.08f);
        }
        for(String lang:new String[]{LocaleStore.ZH_CN,LocaleStore.EN,LocaleStore.JA}){
            for(String theme:new String[]{ThemeStore.MODE_LIGHT,ThemeStore.MODE_DARK}){
                capture(lang,theme,AdvancedGuideActivity.class,"advanced-guide",false,false);
                if(LocaleStore.ZH_CN.equals(lang)){
                    capture(lang,theme,TagParticipationActivity.class,"tag-editor",false,false);
                    capture(lang,theme,UpdateActivity.class,"update-preview",false,true);
                    capture(lang,theme,HomeActivity.class,"selection-bar",true,false);
                }
            }
        }
    }
}
