package com.picalibrary.android;

import static org.junit.Assert.*;
import static org.robolectric.Shadows.shadowOf;
import android.content.Context;
import android.content.Intent;
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

    @Test public void allAdvancedChaptersLaunchTheirActualPagesWithAnExplicitTourRequest(){
        Class<?>[] destinations=new Class<?>[]{
            AccountSourcesActivity.class,RecommendationControlActivity.class,
            RecommendationStyleActivity.class,PairingActivity.class,
            RemoteStorageActivity.class,DownloadsActivity.class,
            RecommendationProfileActivity.class,UpdateActivity.class
        };
        for(int chapter=0;chapter<destinations.length;chapter++){
            OnboardingStore.advancedPosition(context,chapter);
            try(ActivityController<AdvancedGuideActivity> controller=
                    Robolectric.buildActivity(AdvancedGuideActivity.class).setup()){
                AdvancedGuideActivity activity=controller.get();
                activity.getWindow().getDecorView().findViewWithTag("advanced-guide-open").performClick();
                Intent launched=shadowOf(activity).getNextStartedActivity();
                assertNotNull("chapter "+chapter,launched);
                assertEquals("chapter "+chapter,destinations[chapter].getName(),
                        launched.getComponent().getClassName());
                if(chapter==2){
                    assertTrue(launched.getBooleanExtra("startDetailedOnboarding",false));
                    assertFalse(launched.hasExtra(AndroidOnboarding.EXTRA_ADVANCED_CHAPTER));
                }else{
                    assertEquals(chapter,launched.getIntExtra(AndroidOnboarding.EXTRA_ADVANCED_CHAPTER,-1));
                }
                assertTrue("opening a tour cannot mark the chapter read",
                        OnboardingStore.advancedRead(context).isEmpty());
            }
        }
    }

    @Test public void advancedSpotlightResourcesMatchEveryLocalizedChapter(){
        String[] titles=context.getResources().getStringArray(R.array.advanced_spotlight_step_titles);
        String[] bodies=context.getResources().getStringArray(R.array.advanced_spotlight_step_bodies);
        assertEquals(16,titles.length);
        assertEquals(16,bodies.length);
        for(int i=0;i<16;i++){
            assertFalse("empty spotlight title "+i,titles[i].trim().isEmpty());
            assertFalse("empty spotlight description "+i,bodies[i].trim().isEmpty());
        }
    }
}
