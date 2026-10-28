package com.picalibrary.android;

import static org.junit.Assert.*;

import android.app.Application;
import android.content.Intent;
import android.os.Bundle;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.android.controller.ActivityController;
import org.robolectric.annotation.Config;
import org.robolectric.annotation.LooperMode;

/** Guardrail: a source guide is a passive UI visit, including after resume/rotation. */
@RunWith(RobolectricTestRunner.class)
@Config(sdk=35,application=Application.class)
@LooperMode(LooperMode.Mode.PAUSED)
public final class AccountSourcesGuidePreviewTest {
    @Test public void guideRemainsPassiveAfterChapterExtraIsConsumedAndAfterRecreation(){
        Application app=RuntimeEnvironment.getApplication();
        Intent intent=new Intent(app,AccountSourcesActivity.class)
            .putExtra(AndroidOnboarding.EXTRA_ADVANCED_CHAPTER,0);
        Bundle saved=new Bundle();
        try(ActivityController<AccountSourcesActivity> controller=
                Robolectric.buildActivity(AccountSourcesActivity.class,intent)
                    .create().start().resume().visible()){
            AccountSourcesActivity activity=controller.get();
            assertTrue(activity.isGuidePreview());
            // LocaleAwareActivity.onPostResume has consumed the one-shot spotlight
            // request. That must not turn the current visit into a probing visit.
            assertFalse(activity.getIntent().hasExtra(AndroidOnboarding.EXTRA_ADVANCED_CHAPTER));
            controller.pause().resume();
            assertTrue("returning to the chapter cannot trigger automatic probes",
                activity.isGuidePreview());
            controller.saveInstanceState(saved);
            assertTrue(saved.getBoolean("guidePreview"));
        }

        // On configuration recreation the transient extra is gone, but the
        // passive state must persist without re-launching the spotlight.
        try(ActivityController<AccountSourcesActivity> controller=
                Robolectric.buildActivity(AccountSourcesActivity.class,intent)
                    .create(saved).start().resume().visible()){
            assertTrue(controller.get().isGuidePreview());
        }
    }

    @Test public void normalAccountPageNeverInheritsGuideMode(){
        try(ActivityController<AccountSourcesActivity> controller=
                Robolectric.buildActivity(AccountSourcesActivity.class)
                    .create().start().resume().visible()){
            assertFalse(controller.get().isGuidePreview());
        }
    }
}
