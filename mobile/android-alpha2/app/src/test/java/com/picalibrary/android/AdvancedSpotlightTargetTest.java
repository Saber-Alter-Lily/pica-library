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
}
