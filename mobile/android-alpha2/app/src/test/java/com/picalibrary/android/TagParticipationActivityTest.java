package com.picalibrary.android;

import static org.junit.Assert.*;
import static org.robolectric.Shadows.shadowOf;
import android.content.Context;
import android.os.Bundle;
import android.os.Looper;
import android.view.*;
import android.widget.*;
import java.util.*;
import java.util.concurrent.*;
import org.junit.*;
import org.junit.runner.RunWith;
import org.robolectric.*;
import org.robolectric.android.controller.ActivityController;
import org.robolectric.annotation.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk=35,application=android.app.Application.class)
@LooperMode(LooperMode.Mode.PAUSED)
public class TagParticipationActivityTest {
    public static class TestActivity extends TagParticipationActivity {
        @Override protected ExecutorService createWorker(){return new AbstractExecutorService(){private boolean stopped;public void shutdown(){stopped=true;}public List<Runnable> shutdownNow(){stopped=true;return Collections.emptyList();}public boolean isShutdown(){return stopped;}public boolean isTerminated(){return stopped;}public boolean awaitTermination(long t,TimeUnit u){return stopped;}public void execute(Runnable command){command.run();}};}
    }
    private Context context;
    @Before public void fixture(){
        context=RuntimeEnvironment.getApplication();context.getSharedPreferences("recommendation-policy-v5",0).edit().clear().commit();UnifiedCatalogStore.Snapshot catalog=new UnifiedCatalogStore.Snapshot();UnifiedCatalogStore.Entry entry=new UnifiedCatalogStore.Entry("synthetic-local-work");entry.favorite=true;entry.title="Synthetic work";for(int i=0;i<1205;i++)entry.tags.add(String.format(Locale.ROOT,"tag-%04d",i));catalog.byId.put(entry.id,entry);UnifiedCatalogStore.save(context,catalog);
    }
    private View find(TagParticipationActivity activity,String tag){return activity.getWindow().getDecorView().findViewWithTag(tag);}
    private int checkboxes(View view){int count=view instanceof CheckBox?1:0;if(view instanceof ViewGroup)for(int i=0;i<((ViewGroup)view).getChildCount();i++)count+=checkboxes(((ViewGroup)view).getChildAt(i));return count;}
    @Test public void largeDirectoryIsPagedAndChangesAreStagedUntilSave() throws Exception {
        try(ActivityController<TestActivity> controller=Robolectric.buildActivity(TestActivity.class).setup()){
            TestActivity activity=controller.get();shadowOf(Looper.getMainLooper()).idle();assertNotNull(find(activity,"tag-none"));assertEquals(100,checkboxes(activity.getWindow().getDecorView()));
            find(activity,"tag-none").performClick();((CheckBox)find(activity,"tag-row:pica|tag-0000")).setChecked(true);assertFalse(RecommendationPolicyStore.hasPendingPortableChanges(context));assertEquals("ALL",TagParticipation.of(RecommendationPolicyStore.snapshot(context)).mode);
            find(activity,"tag-save").performClick();shadowOf(Looper.getMainLooper()).idle();assertTrue(RecommendationPolicyStore.hasPendingPortableChanges(context));TagParticipation policy=TagParticipation.of(RecommendationPolicyStore.snapshot(context));assertEquals("SELECTED",policy.mode);assertTrue(policy.enabled("pica|tag-0000"));assertFalse(policy.enabled("pica|tag-0001"));
        }
    }
    @Test public void recreationRetainsDraftAndUndoDoesNotWrite() throws Exception {
        Bundle saved=new Bundle();
        try(ActivityController<TestActivity> controller=Robolectric.buildActivity(TestActivity.class).setup()){
            TestActivity activity=controller.get();shadowOf(Looper.getMainLooper()).idle();find(activity,"tag-none").performClick();((CheckBox)find(activity,"tag-row:pica|tag-0000")).setChecked(true);controller.saveInstanceState(saved);
        }
        try(ActivityController<TestActivity> controller=Robolectric.buildActivity(TestActivity.class).create(saved).start().resume().visible()){
            TestActivity activity=controller.get();shadowOf(Looper.getMainLooper()).idle();assertTrue(((CheckBox)find(activity,"tag-row:pica|tag-0000")).isChecked());assertFalse(((CheckBox)find(activity,"tag-row:pica|tag-0001")).isChecked());assertTrue(find(activity,"tag-save").isEnabled());find(activity,"tag-undo").performClick();assertFalse(find(activity,"tag-save").isEnabled());assertFalse(RecommendationPolicyStore.hasPendingPortableChanges(context));
        }
    }
}
