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
import android.widget.TextView;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import com.developer.spoti.vspoti.VSpotView;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.io.File;
import java.io.FileOutputStream;
import java.util.concurrent.atomic.AtomicReference;

/** Real opt-in tour visuals, using a fresh isolated emulator; never tap business controls. */
@RunWith(AndroidJUnit4.class)
public final class S1AdditionalSpotlightTest {
    private static final String TAG="S1_VISUAL";

    @Test public void pairingTwoLiveControlsWithoutPairing() throws Exception {
        verify(PairingActivity.class,3,AndroidOnboarding.ADV_PAIR_SCAN,
            AndroidOnboarding.ADV_PAIR_MANUAL,"pairing");
    }

    @Test public void updateTwoLiveControlsWithoutCheckingUpdates() throws Exception {
        verify(UpdateActivity.class,7,AndroidOnboarding.ADV_UPDATE_STATUS,
            AndroidOnboarding.ADV_UPDATE_CHECK,"update");
    }

    @Test public void preferenceTwoLiveControlsWithoutSaving() throws Exception {
        verify(RecommendationControlActivity.class,1,AndroidOnboarding.ADV_PREFERENCE_TAGS,
            AndroidOnboarding.ADV_PREFERENCE_SAVE,"preferences");
    }

    @Test public void webdavTwoLiveControlsWithoutConnecting() throws Exception {
        verify(RemoteStorageActivity.class,4,AndroidOnboarding.ADV_REMOTE_TARGET,
            AndroidOnboarding.ADV_REMOTE_VENDOR,"webdav");
    }

    @Test public void profileTwoLiveControlsWithoutRebuilding() throws Exception {
        verify(RecommendationProfileActivity.class,6,AndroidOnboarding.ADV_PROFILE_RUNTIME,
            AndroidOnboarding.ADV_PROFILE_EVIDENCE,"profile");
    }

    private void verify(Class<? extends Activity> target,int chapter,
            String expectedFirst,String expectedSecond,String prefix) throws Exception {
        Instrumentation inst=InstrumentationRegistry.getInstrumentation();
        Context app=inst.getTargetContext().getApplicationContext();
        app.getSharedPreferences("pica-disclaimer-v1",Context.MODE_PRIVATE)
            .edit().putString("accepted_version","1").commit();
        app.getSharedPreferences("updater-v1",Context.MODE_PRIVATE)
            .edit().putLong("lastAutoCheckAt",System.currentTimeMillis()).commit();
        OnboardingStore.setAutoShow(app,false);
        LocaleStore.set(app,LocaleStore.ZH_CN);
        app.getSharedPreferences("appearance-v1",Context.MODE_PRIVATE)
            .edit().putString("mode",ThemeStore.MODE_LIGHT).commit();
        String font=InstrumentationRegistry.getArguments().getString("expectedFontScale","1.0");
        assertEquals(Float.parseFloat(font),app.getResources().getConfiguration().fontScale,0.08f);
        Instrumentation.ActivityMonitor monitor=inst.addMonitor(target.getName(),null,false);
        Activity page=null;
        try {
            Intent intent=new Intent(app,target)
                .putExtra(AndroidOnboarding.EXTRA_ADVANCED_CHAPTER,chapter)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            Log.i(TAG,"phase="+prefix+"-launch-start");
            app.startActivity(intent);
            Activity seen=monitor.waitForActivityWithTimeout(20000);
            assertNotNull("Guide Activity did not start",seen);
            assertTrue("Wrong guide Activity",target.isInstance(seen));
            page=seen;
            final Activity screen=page;
            Log.i(TAG,"phase="+prefix+"-activity-observed");
            AtomicReference<VSpotView> current=new AtomicReference<>();
            for(int attempt=0;attempt<60;attempt++){
                inst.runOnMainSync(()->{
                    View decor=screen.getWindow().getDecorView();
                    if(!(decor instanceof ViewGroup))return;
                    ViewGroup root=(ViewGroup)decor;
                    for(int i=0;i<root.getChildCount();i++){
                        View view=root.getChildAt(i);
                        if(view instanceof VSpotView&&((VSpotView)view).isShowing())
                            current.set((VSpotView)view);
                    }
                });
                if(current.get()!=null&&current.get().getCurrentStep()!=null)break;
                SystemClock.sleep(150);
            }
            assertNotNull("Actual VSpot did not appear",current.get());
            AtomicReference<String> first=new AtomicReference<>();
            AtomicReference<Boolean> secondVisible=new AtomicReference<>(false);
            AtomicReference<Integer> count=new AtomicReference<>();
            AtomicReference<Integer> index=new AtomicReference<>();
            AtomicReference<String> updateStatus=new AtomicReference<>();
            inst.runOnMainSync(()->{
                VSpotView tour=current.get();
                count.set(tour.getStepCount());
                index.set(tour.getCurrentIndex());
                View selected=tour.getCurrentTargetView();
                first.set(selected==null?null:String.valueOf(selected.getTag()));
                View second=screen.getWindow().getDecorView().findViewWithTag(expectedSecond);
                secondVisible.set(second!=null&&second.isShown());
                if(chapter==7){
                    View status=screen.getWindow().getDecorView()
                        .findViewWithTag(AndroidOnboarding.ADV_UPDATE_STATUS);
                    if(status instanceof TextView)
                        updateStatus.set(((TextView)status).getText().toString());
                }
            });
            assertEquals(Integer.valueOf(2),count.get());
            assertEquals(Integer.valueOf(0),index.get());
            assertEquals(expectedFirst,first.get());
            assertTrue("Missing visible second control",secondVisible.get());
            if(chapter==1){
                AtomicReference<Boolean> saveEnabled=new AtomicReference<>(true);
                inst.runOnMainSync(()->{
                    View save=screen.getWindow().getDecorView()
                        .findViewWithTag(AndroidOnboarding.ADV_PREFERENCE_SAVE);
                    saveEnabled.set(save!=null&&save.isEnabled());
                });
                assertFalse("Guide cannot turn on Save without any manual edits",saveEnabled.get());
            }
            if(chapter==7)assertEquals("Guide must be read-only",
                screen.getString(R.string.advanced_guide_update_preview),updateStatus.get());
            Log.i(TAG,"phase="+prefix+"-first-visible");
            SystemClock.sleep(240);
            image(inst,app,font,prefix+"-spotlight-1");
            AtomicReference<String> secondTag=new AtomicReference<>();
            AtomicReference<Integer> secondIndex=new AtomicReference<>();
            inst.runOnMainSync(()->{
                current.get().next();
                secondIndex.set(current.get().getCurrentIndex());
                View view=current.get().getCurrentTargetView();
                secondTag.set(view==null?null:String.valueOf(view.getTag()));
            });
            assertEquals(Integer.valueOf(1),secondIndex.get());
            assertEquals(expectedSecond,secondTag.get());
            Log.i(TAG,"phase="+prefix+"-second-visible");
            SystemClock.sleep(240);
            image(inst,app,font,prefix+"-spotlight-2");
            inst.runOnMainSync(()->current.get().dismiss());
            SystemClock.sleep(480);
            assertFalse("Skip must not mark guide read",
                OnboardingStore.advancedRead(app).contains(String.valueOf(chapter)));
            if(chapter==1){
                AtomicReference<Boolean> saveEnabled=new AtomicReference<>(true);
                inst.runOnMainSync(()->{
                    View save=screen.getWindow().getDecorView()
                        .findViewWithTag(AndroidOnboarding.ADV_PREFERENCE_SAVE);
                    saveEnabled.set(save!=null&&save.isEnabled());
                });
                assertFalse("Skipping cannot save any preference",saveEnabled.get());
            }
            if(chapter==7){
                AtomicReference<String> after=new AtomicReference<>();
                inst.runOnMainSync(()->{
                    View status=screen.getWindow().getDecorView()
                        .findViewWithTag(AndroidOnboarding.ADV_UPDATE_STATUS);
                    if(status instanceof TextView)
                        after.set(((TextView)status).getText().toString());
                });
                assertEquals("Skip must not start update check",
                    screen.getString(R.string.advanced_guide_update_preview),after.get());
            }
            Log.i(TAG,"phase="+prefix+"-skip-no-action");
        } finally {
            inst.removeMonitor(monitor);
            if(page!=null){
                Activity closing=page;
                inst.runOnMainSync(()->{if(!closing.isFinishing())closing.finish();});
            }
        }
    }


    @Test public void fiveVisualStepsHaveVisibleLiveTargetsWithoutStartingRecommendation() throws Exception {
        Instrumentation inst=InstrumentationRegistry.getInstrumentation();
        Context app=inst.getTargetContext().getApplicationContext();
        app.getSharedPreferences("pica-disclaimer-v1",Context.MODE_PRIVATE)
            .edit().putString("accepted_version","1").commit();
        OnboardingStore.setAutoShow(app,false);
        LocaleStore.set(app,LocaleStore.ZH_CN);
        app.getSharedPreferences("appearance-v1",Context.MODE_PRIVATE)
            .edit().putString("mode",ThemeStore.MODE_LIGHT).commit();
        String font=InstrumentationRegistry.getArguments().getString("expectedFontScale","1.0");
        assertEquals(Float.parseFloat(font),app.getResources().getConfiguration().fontScale,0.08f);
        String beforeCycle=NativeRecommendationStore.load(app).cycleId;
        Instrumentation.ActivityMonitor monitor=inst.addMonitor(
            RecommendationStyleActivity.class.getName(),null,false);
        RecommendationStyleActivity activity=null;
        try{
            Intent intent=new Intent(app,RecommendationStyleActivity.class)
                .putExtra("startDetailedOnboarding",true)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            Log.i(TAG,"phase=visual-five-launch");
            app.startActivity(intent);
            Activity opened=monitor.waitForActivityWithTimeout(20000);
            assertNotNull("Actual Visual settings did not open",opened);
            assertTrue(opened instanceof RecommendationStyleActivity);
            activity=(RecommendationStyleActivity)opened;
            final RecommendationStyleActivity screen=activity;
            AtomicReference<VSpotView> overlay=new AtomicReference<>();
            for(int attempt=0;attempt<60;attempt++){
                inst.runOnMainSync(()->{
                    View root=screen.getWindow().getDecorView();
                    if(!(root instanceof ViewGroup))return;
                    ViewGroup group=(ViewGroup)root;
                    for(int i=0;i<group.getChildCount();i++){
                        View child=group.getChildAt(i);
                        if(child instanceof VSpotView&&((VSpotView)child).isShowing())
                            overlay.set((VSpotView)child);
                    }
                });
                if(overlay.get()!=null&&overlay.get().getCurrentStep()!=null)break;
                SystemClock.sleep(150);
            }
            assertNotNull("Original five-step Visual VSpot not shown",overlay.get());
            String[] expected={
                AndroidOnboarding.REC_PROFILE,AndroidOnboarding.REC_ADJUST,
                AndroidOnboarding.REC_SYNC,AndroidOnboarding.REC_VISUAL_MODE,
                AndroidOnboarding.REC_VISUAL_STRENGTH
            };
            AtomicReference<Integer> count=new AtomicReference<>();
            inst.runOnMainSync(()->count.set(overlay.get().getStepCount()));
            assertEquals(5,(int)count.get());
            for(int step=0;step<expected.length;step++){
                final int index=step;
                if(step>0)inst.runOnMainSync(()->overlay.get().next());
                SystemClock.sleep(320);
                AtomicReference<Integer> actualStep=new AtomicReference<>();
                AtomicReference<String> tag=new AtomicReference<>();
                AtomicReference<Boolean> visible=new AtomicReference<>(false);
                inst.runOnMainSync(()->{
                    VSpotView tour=overlay.get();
                    actualStep.set(tour.getCurrentIndex());
                    View target=tour.getCurrentTargetView();
                    tag.set(target==null?null:String.valueOf(target.getTag()));
                    android.graphics.Rect rect=new android.graphics.Rect();
                    visible.set(target!=null&&target.isShown()&&target.getGlobalVisibleRect(rect)
                        &&rect.width()>0&&rect.height()>0);
                });
                assertEquals(index,(int)actualStep.get());
                assertEquals(expected[index],tag.get());
                assertTrue("Visual target must be in viewport: "+expected[index],visible.get());
                image(inst,app,font,"visual-spotlight-"+(index+1));
                Log.i(TAG,"phase=visual-five-step-"+index);
            }
            inst.runOnMainSync(()->overlay.get().dismiss());
            SystemClock.sleep(480);
            assertFalse("Skipping cannot mark Visual chapter read",
                OnboardingStore.advancedRead(app).contains("2"));
            assertEquals("Guide must not create a recommendation cycle",
                beforeCycle,NativeRecommendationStore.load(app).cycleId);
            Log.i(TAG,"phase=visual-five-skip-no-model");
        }finally{
            inst.removeMonitor(monitor);
            if(activity!=null){
                RecommendationStyleActivity close=activity;
                inst.runOnMainSync(()->{if(!close.isFinishing())close.finish();});
            }
        }
    }

    private static void image(Instrumentation inst,Context app,String font,String name) throws Exception {
        String folder=Float.parseFloat(font)>=1.3f?"f150":"f100";
        File dir=new File(app.getFilesDir(),"s1-visual-"+folder);
        assertTrue(dir.isDirectory()||dir.mkdirs());
        Bitmap bitmap=inst.getUiAutomation().takeScreenshot();
        assertNotNull("No Android screenshot",bitmap);
        try{
            File file=new File(dir,"zhCN-light-"+name+".png");
            try(FileOutputStream output=new FileOutputStream(file)){
                assertTrue(bitmap.compress(Bitmap.CompressFormat.PNG,100,output));
                output.getFD().sync();
            }
            assertTrue("Empty PNG",file.length()>1000);
            Log.i(TAG,"phase="+name+"-captured bytes="+file.length());
        }finally{bitmap.recycle();}
    }
}
