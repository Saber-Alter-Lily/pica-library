package com.picalibrary.android;

import static org.junit.Assert.*;
import static org.robolectric.Shadows.shadowOf;
import android.content.Context;
import android.os.Bundle;
import org.junit.*;
import org.junit.runner.RunWith;
import org.robolectric.*;
import org.robolectric.android.controller.ActivityController;
import org.robolectric.annotation.Config;
import org.robolectric.annotation.LooperMode;

@RunWith(RobolectricTestRunner.class)
@Config(sdk=35,application=android.app.Application.class)
@LooperMode(LooperMode.Mode.PAUSED)
public class DualOnboardingTest {
    private Context context;
    @Before public void clear(){context=RuntimeEnvironment.getApplication();context.getSharedPreferences("pica-onboarding-v1",Context.MODE_PRIVATE).edit().clear().commit();OnboardingStore.replay();}
    @Test public void oldTourDoesNotPromptAgain(){context.getSharedPreferences("pica-onboarding-v1",Context.MODE_PRIVATE).edit().putInt("completedVersion",2).commit();assertFalse(OnboardingStore.shouldPrompt(context));assertEquals(0,OnboardingStore.advancedRead(context).size());}
    @Test public void advancedCompletionNeverCompletesDaily(){assertTrue(OnboardingStore.shouldPrompt(context));OnboardingStore.completeAdvanced(context);OnboardingStore.markAdvancedRead(context,2);assertTrue(OnboardingStore.shouldPrompt(context));assertEquals(0,OnboardingStore.completedVersion(context));assertEquals(1,OnboardingStore.advancedRead(context).size());}
    @Test public void advancedSkipNeverDismissesDaily(){OnboardingStore.skipAdvanced(context);assertTrue(OnboardingStore.shouldPrompt(context));assertEquals(0,OnboardingStore.dismissedVersion(context));assertTrue(OnboardingStore.advancedRead(context).isEmpty());}
    @Test public void invalidChaptersAndGetterMutationAreIgnored(){OnboardingStore.markAdvancedRead(context,-1);OnboardingStore.markAdvancedRead(context,8);OnboardingStore.advancedRead(context).add("0");assertTrue(OnboardingStore.advancedRead(context).isEmpty());OnboardingStore.advancedPosition(context,99);assertEquals(7,OnboardingStore.advancedPosition(context));}
    @Test public void dailyCompletionAndAutomaticPreferenceStayIndependent(){OnboardingStore.setAutoShow(context,false);OnboardingStore.markAdvancedRead(context,1);OnboardingStore.complete(context);assertFalse(OnboardingStore.autoShow(context));assertEquals(1,OnboardingStore.advancedRead(context).size());assertEquals(OnboardingStore.CURRENT_VERSION,OnboardingStore.completedVersion(context));}
    @Test public void advancedGuideRestoresChapterAndOnlyRecordsExplicitRead(){
        OnboardingStore.advancedPosition(context,2);
        try(ActivityController<AdvancedGuideActivity> controller=Robolectric.buildActivity(AdvancedGuideActivity.class).setup()){
            AdvancedGuideActivity activity=controller.get();
            assertNotNull(activity.getWindow().getDecorView().findViewWithTag("advanced-guide-body"));
            assertEquals(0,OnboardingStore.advancedRead(context).size());
            activity.getWindow().getDecorView().findViewWithTag("advanced-guide-read-next").performClick();
            assertTrue(OnboardingStore.advancedRead(context).contains("2"));
            assertEquals(3,OnboardingStore.advancedPosition(context));
            assertEquals(0,OnboardingStore.completedVersion(context));
            Bundle saved=new Bundle();controller.saveInstanceState(saved);assertEquals(3,saved.getInt("guideChapter"));
        }
    }
    @Test public void openingFeatureNavigatesWithoutMarkingItConfigured(){
        OnboardingStore.advancedPosition(context,1);
        try(ActivityController<AdvancedGuideActivity> controller=Robolectric.buildActivity(AdvancedGuideActivity.class).setup()){
            AdvancedGuideActivity activity=controller.get();
            activity.getWindow().getDecorView().findViewWithTag("advanced-guide-open").performClick();
            assertEquals(RecommendationControlActivity.class.getName(),shadowOf(activity).getNextStartedActivity().getComponent().getClassName());
            assertTrue(OnboardingStore.advancedRead(context).isEmpty());
            assertEquals(0,OnboardingStore.completedVersion(context));
        }
    }
}
