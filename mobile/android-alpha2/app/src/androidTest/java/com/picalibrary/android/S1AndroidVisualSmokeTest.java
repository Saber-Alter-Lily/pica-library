package com.picalibrary.android;

import static org.junit.Assert.*;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.os.SystemClock;
import android.util.Log;
import android.view.View;
import android.view.ViewGroup;
import com.developer.spoti.vspoti.VSpotView;
import java.util.concurrent.atomic.AtomicReference;

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
    private static final String TAG="S1_VISUAL";

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
        Log.i(TAG,"phase=preferences page="+page+" lang="+lang+" theme="+theme);
        LocaleStore.set(context,lang);
        // Persist the actual app theme, without system-wide night-mode binder churn.
        context.getSharedPreferences("appearance-v1",Context.MODE_PRIVATE).edit()
            .putString("mode",theme).commit();
        Intent intent=new Intent(context,screen);
        if(preview) intent.putExtra(AndroidOnboarding.EXTRA_ADVANCED_CHAPTER,7);

        Log.i(TAG,"phase=launch-start page="+page);
        try(ActivityScenario<? extends Activity> scenario=ActivityScenario.launch(intent)){
            Log.i(TAG,"phase=launch-resumed page="+page);
            Instrumentation inst=InstrumentationRegistry.getInstrumentation();
            SystemClock.sleep(350);
            Log.i(TAG,"phase=inspect-start page="+page);
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
            Log.i(TAG,"phase=inspect-complete page="+page);
            Bitmap image=inst.getUiAutomation().takeScreenshot();
            Log.i(TAG,"phase=screenshot-complete page="+page);
            assertNotNull("Unable to capture screenshot for "+page,image);
            try {
                assertTrue("Screenshot width too small",image.getWidth()>=320);
                assertTrue("Screenshot height too small",image.getHeight()>=500);
                // Store screenshots in the fresh debug app's private files dir.
                // Android blocks shell deletion/pull under /sdcard/Android/data on API 35.
                String expected=InstrumentationRegistry.getArguments().getString("expectedFontScale","1.0");
                String folder=Float.parseFloat(expected)>=1.3f?"f150":"f100";
                File dir=new File(context.getFilesDir(),DIRECTORY+"-"+folder);
                assertNotNull("No app-private screenshot directory",dir);
                assertTrue(dir.isDirectory()||dir.mkdirs());
                String safe=lang.replace("-","")+"-"+theme+"-"+page+".png";
                File destination=new File(dir,safe);
                try(FileOutputStream out=new FileOutputStream(destination)){
                    assertTrue("PNG encode failed",image.compress(Bitmap.CompressFormat.PNG,100,out));
                    out.getFD().sync();
                }
                assertTrue("Screenshot empty: "+safe,destination.length()>500);
                Log.i(TAG,"phase=written page="+page+" bytes="+destination.length());
            }finally{image.recycle();}
        }
        Log.i(TAG,"phase=closed page="+page);
    }

    @Test public void captureFirstRealGuideScreenWithoutUserData() throws Exception {
        prepare();
        String expected=InstrumentationRegistry.getArguments().getString("expectedFontScale","1.0");
        float actual=app().getResources().getConfiguration().fontScale;
        Log.i(TAG,"phase=test-start expectedFont="+expected+" actualFont="+actual);
        assertEquals("Screenshot must honor Android font scale",
                Float.parseFloat(expected),actual,0.08f);
        capture(LocaleStore.ZH_CN,ThemeStore.MODE_LIGHT,
                AdvancedGuideActivity.class,"advanced-guide",false,false);
        Log.i(TAG,"phase=test-complete");
    }

    /**
     * S1-04: first real spotlight evidence, not a screenshot of the text-only guide menu.
     * No provider is enabled or connected, and skip may not perform the highlighted actions.
     */
    @Test public void captureRealSourceSpotlightWithoutRunningProviderActions() throws Exception {
        prepare();
        Context context=app();
        LocaleStore.set(context,LocaleStore.ZH_CN);
        context.getSharedPreferences("appearance-v1",Context.MODE_PRIVATE)
            .edit().putString("mode",ThemeStore.MODE_LIGHT).commit();
        Intent intent=new Intent(context,AccountSourcesActivity.class)
            .putExtra(AndroidOnboarding.EXTRA_ADVANCED_CHAPTER,0);
        Log.i(TAG,"phase=spotlight-launch");
        try(ActivityScenario<AccountSourcesActivity> scenario=ActivityScenario.launch(intent)){
            AtomicReference<VSpotView> current=new AtomicReference<>();
            for(int attempt=0;attempt<45;attempt++){
                scenario.onActivity(activity->{
                    ViewGroup decor=(ViewGroup)activity.getWindow().getDecorView();
                    for(int i=0;i<decor.getChildCount();i++){
                        View child=decor.getChildAt(i);
                        if(child instanceof VSpotView && ((VSpotView)child).isShowing())
                            current.set((VSpotView)child);
                    }
                });
                if(current.get()!=null && current.get().getCurrentStep()!=null)break;
                SystemClock.sleep(150);
            }
            assertNotNull("Explicit source chapter must display a live VSpot overlay",current.get());
            Log.i(TAG,"phase=spotlight-visible step="+current.get().getCurrentIndex());
            scenario.onActivity(activity->{
                VSpotView overlay=current.get();
                assertEquals(2,overlay.getStepCount());
                assertEquals(0,overlay.getCurrentIndex());
                assertEquals(AndroidOnboarding.ADV_SOURCE_CHOICES,
                    overlay.getCurrentTargetView().getTag());
                assertNotNull(activity.getWindow().getDecorView()
                    .findViewWithTag(AndroidOnboarding.ADV_SOURCE_HOST));
            });
            SystemClock.sleep(240);
            saveSpotlightImage(context,"source-spotlight-1");
            scenario.onActivity(activity->{
                current.get().next();
                assertEquals(1,current.get().getCurrentIndex());
                assertEquals(AndroidOnboarding.ADV_SOURCE_HOST,
                    current.get().getCurrentTargetView().getTag());
            });
            Log.i(TAG,"phase=spotlight-next");
            SystemClock.sleep(240);
            saveSpotlightImage(context,"source-spotlight-2");
            scenario.onActivity(activity->current.get().dismiss());
            SystemClock.sleep(380);
            assertFalse("Skip cannot mark this chapter read",
                OnboardingStore.advancedRead(context).contains("0"));
            Log.i(TAG,"phase=spotlight-skip-no-write");
        }
    }

    private void saveSpotlightImage(Context context,String name) throws Exception {
        String font=InstrumentationRegistry.getArguments().getString("expectedFontScale","1.0");
        String folder=Float.parseFloat(font)>=1.3f?"f150":"f100";
        File dir=new File(context.getFilesDir(),DIRECTORY+"-"+folder);
        assertTrue(dir.isDirectory()||dir.mkdirs());
        Bitmap image=InstrumentationRegistry.getInstrumentation()
            .getUiAutomation().takeScreenshot();
        assertNotNull("No real Android overlay screenshot: "+name,image);
        try{
            File file=new File(dir,"zhCN-light-"+name+".png");
            try(FileOutputStream output=new FileOutputStream(file)){
                assertTrue("Unable to encode overlay PNG",
                    image.compress(Bitmap.CompressFormat.PNG,100,output));
                output.getFD().sync();
            }
            assertTrue("Captured empty overlay PNG",file.length()>1000);
            Log.i(TAG,"phase=spotlight-captured page="+name+" bytes="+file.length());
        }finally{image.recycle();}
    }

}
