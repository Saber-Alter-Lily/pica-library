package com.picalibrary.android;

import static org.junit.Assert.*;

import android.app.Activity;
import android.app.Application;
import android.content.Context;
import android.content.Intent;
import android.view.View;
import android.widget.TextView;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.android.controller.ActivityController;
import org.robolectric.annotation.Config;

/** S1-04: destination target and explicit read-only preview contracts, not visual/device acceptance. */
@RunWith(RobolectricTestRunner.class)
@Config(sdk=35)
public class AdvancedSpotlightTargetTest {
    @Before public void setup(){
        Application app=RuntimeEnvironment.getApplication();
        app.getSharedPreferences("pica-disclaimer-v1",Context.MODE_PRIVATE)
                .edit().putString("accepted_version","1").commit();
    }

    private <T extends Activity> void targets(Class<T> cls,String... tags){
        try(ActivityController<T> controller=Robolectric.buildActivity(cls).create()){
            T screen=controller.get();
            for(String tag:tags){
                View target=screen.getWindow().getDecorView().findViewWithTag(tag);
                assertNotNull(cls.getSimpleName()+" missing live target "+tag,target);
                assertEquals(View.VISIBLE,target.getVisibility());
            }
        }
    }

    @Test public void sourcesAndPairingHaveActualGuideTargets(){
        targets(AccountSourcesActivity.class,
                AndroidOnboarding.ADV_SOURCE_CHOICES,AndroidOnboarding.ADV_SOURCE_HOST);
        targets(PairingActivity.class,
                AndroidOnboarding.ADV_PAIR_SCAN,AndroidOnboarding.ADV_PAIR_MANUAL);
    }

    @Test public void cloudAndVisualSettingsExposeRealControls(){
        targets(RemoteStorageActivity.class,
                AndroidOnboarding.ADV_REMOTE_TARGET,AndroidOnboarding.ADV_REMOTE_TEST);
        targets(RecommendationStyleActivity.class,
                AndroidOnboarding.REC_VISUAL_MODE,AndroidOnboarding.REC_VISUAL_STRENGTH);
    }

    @Test public void updateGuideOpensWithoutAutomaticUpdateCheck(){
        Application app=RuntimeEnvironment.getApplication();
        Intent intent=new Intent(app,UpdateActivity.class)
                .putExtra(AndroidOnboarding.EXTRA_ADVANCED_CHAPTER,7);
        try(ActivityController<UpdateActivity> controller=
                Robolectric.buildActivity(UpdateActivity.class,intent).create()){
            UpdateActivity screen=controller.get();
            View status=screen.getWindow().getDecorView().findViewWithTag(AndroidOnboarding.ADV_UPDATE_STATUS);
            View check=screen.getWindow().getDecorView().findViewWithTag(AndroidOnboarding.ADV_UPDATE_CHECK);
            assertNotNull(status);
            assertNotNull(check);
            assertEquals(screen.getString(R.string.advanced_guide_update_preview),
                    ((TextView)status).getText().toString());
            assertTrue(check.isEnabled());
        }
    }

    @Test public void manualPreferenceSaveAndDownloadTasksHaveStableTargets(){
        targets(RecommendationControlActivity.class,AndroidOnboarding.ADV_PREFERENCE_SAVE);
        targets(DownloadsActivity.class,AndroidOnboarding.ADV_DOWNLOAD_TASKS);
    }

    @Test public void preferenceGuideShowsRealSaveButtonButCannotSaveAnEmptyDraft(){
        Application app=RuntimeEnvironment.getApplication();
        Intent intent=new Intent(app,RecommendationControlActivity.class)
            .putExtra(AndroidOnboarding.EXTRA_ADVANCED_CHAPTER,1);
        try(ActivityController<RecommendationControlActivity> controller=
                Robolectric.buildActivity(RecommendationControlActivity.class,intent).create()){
            RecommendationControlActivity activity=controller.get();
            View save=activity.getWindow().getDecorView()
                .findViewWithTag(AndroidOnboarding.ADV_PREFERENCE_SAVE);
            assertNotNull(save);
            View actions=(View)save.getParent(),bar=(View)actions.getParent();
            assertEquals("guide-only empty Save area must be visible",View.VISIBLE,bar.getVisibility());
            assertFalse("guide cannot enable a Save operation without changes",save.isEnabled());
            android.os.Bundle state=new android.os.Bundle();
            controller.saveInstanceState(state);
            assertTrue(state.getBoolean("guidePreview"));
        }
        try(ActivityController<RecommendationControlActivity> controller=
                Robolectric.buildActivity(RecommendationControlActivity.class).create()){
            View save=controller.get().getWindow().getDecorView()
                .findViewWithTag(AndroidOnboarding.ADV_PREFERENCE_SAVE);
            assertNotNull(save);
            View bar=(View)((View)save.getParent()).getParent();
            assertEquals("ordinary empty editor must not gain a persistent bar",
                View.GONE,bar.getVisibility());
        }
    }

    @Test public void guideUpdatePreviewStateSurvivesConfigurationRecreation(){
        Application app=RuntimeEnvironment.getApplication();
        Intent intent=new Intent(app,UpdateActivity.class)
            .putExtra(AndroidOnboarding.EXTRA_ADVANCED_CHAPTER,7);
        android.os.Bundle saved=new android.os.Bundle();
        try(ActivityController<UpdateActivity> c=
                Robolectric.buildActivity(UpdateActivity.class,intent).create()){
            c.saveInstanceState(saved);
            assertTrue(saved.getBoolean("guidePreview"));
        }
        intent.removeExtra(AndroidOnboarding.EXTRA_ADVANCED_CHAPTER);
        try(ActivityController<UpdateActivity> c=
                Robolectric.buildActivity(UpdateActivity.class,intent).create(saved)){
            UpdateActivity screen=c.get();
            TextView state=(TextView)screen.getWindow().getDecorView()
                .findViewWithTag(AndroidOnboarding.ADV_UPDATE_STATUS);
            assertNotNull(state);
            assertEquals("rotation must not silently start update check",
                screen.getString(R.string.advanced_guide_update_preview),state.getText().toString());
        }
    }
}
