package com.picalibrary.android;

import android.app.Activity;
import android.app.AlertDialog;
import android.graphics.Rect;
import android.content.Intent;
import android.view.View;
import android.widget.CheckBox;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;
import java.util.Map;
import java.util.WeakHashMap;
import com.developer.spoti.vspoti.VSpotView;

/** Short daily spotlight; advanced chapters are explicit and separately tracked. */
final class AndroidOnboarding {
    private static final Map<Activity,Integer> pendingTargets=new WeakHashMap<>();
    static final String NAV_LIBRARY="pica-tour-nav-0";
    static final String NAV_RECOMMEND="pica-tour-nav-1";
    static final String NAV_ONLINE="pica-tour-nav-2";
    static final String NAV_SETTINGS="pica-tour-nav-3";
    static final String LIBRARY_SHELVES="pica-tour-library-shelves";
    static final String LIBRARY_REFRESH="pica-tour-library-refresh";
    static final String RECOMMEND_BUILD="pica-tour-recommend-build";
    static final String RECOMMEND_PREFERENCES="pica-tour-recommend-preferences";
    static final String SETTINGS_RECOMMEND="pica-tour-settings-recommend";
    static final String SETTINGS_PAIR="pica-tour-settings-pair";
    static final String SETTINGS_LANGUAGE="pica-tour-settings-language";
    static final String SETTINGS_UPDATE="pica-tour-settings-update";
    static final String SETTINGS_HELP="pica-tour-settings-help";
    static final String REC_PROFILE="pica-tour-rec-profile";
    static final String REC_ADJUST="pica-tour-rec-adjust";
    static final String REC_SYNC="pica-tour-rec-sync";
    static final String REC_VISUAL_MODE="pica-tour-rec-visual-mode";
    static final String REC_VISUAL_STRENGTH="pica-tour-rec-visual-strength";

    // An explicit guide request is passed to the real Activity, never inferred from a normal visit.
    static final String EXTRA_ADVANCED_CHAPTER="pica.guide.advanced.chapter";
    static final String ADV_SOURCE_CHOICES="pica-tour-adv-source-choices";
    static final String ADV_SOURCE_HOST="pica-tour-adv-source-host";
    static final String ADV_PREFERENCE_TAGS="pica-tour-adv-preference-tags";
    static final String ADV_PREFERENCE_SAVE="pica-tour-adv-preference-save";
    static final String ADV_PAIR_SCAN="pica-tour-adv-pair-scan";
    static final String ADV_PAIR_MANUAL="pica-tour-adv-pair-manual";
    static final String ADV_REMOTE_TARGET="pica-tour-adv-remote-target";
    static final String ADV_REMOTE_VENDOR="pica-tour-adv-remote-vendor";
    static final String ADV_REMOTE_TEST="pica-tour-adv-remote-test";
    static final String ADV_DOWNLOAD_TASKS="pica-tour-adv-download-tasks";
    static final String ADV_DOWNLOAD_STORAGE="pica-tour-adv-download-storage";
    static final String ADV_PROFILE_RUNTIME="pica-tour-adv-profile-runtime";
    static final String ADV_PROFILE_EVIDENCE="pica-tour-adv-profile-evidence";
    static final String ADV_UPDATE_STATUS="pica-tour-adv-update-status";
    static final String ADV_UPDATE_CHECK="pica-tour-adv-update-check";

    private AndroidOnboarding(){}

    /** Called after Activity resume only for an explicit guide-launched destination. */
    static void maybeStartAdvancedPageTour(Activity activity){
        Intent intent=activity.getIntent();
        if(intent==null||!intent.hasExtra(EXTRA_ADVANCED_CHAPTER))return;
        int chapter=intent.getIntExtra(EXTRA_ADVANCED_CHAPTER,-1);
        intent.removeExtra(EXTRA_ADVANCED_CHAPTER);
        if(chapter<0||chapter>7||chapter==2)return;
        activity.getWindow().getDecorView().post(()->{
            if(!activity.isFinishing()&&!activity.isDestroyed())
                startAdvancedPageTour(activity,chapter);
        });
    }

    /** Two actual tagged controls per chapter; missing/asynchronous targets never count as completed. */
    private static void startAdvancedPageTour(Activity activity,int chapter){
        final String[] tags=advancedTargetTags(chapter);
        if(tags==null)return;
        View first=target(activity,tags[0]),second=target(activity,tags[1]);
        // A findViewWithTag result inside a GONE panel cannot be spotlighted.
        if(!awaitTargets(activity,()->startAdvancedPageTour(activity,chapter),true,
                advancedVisible(first)?first:null,advancedVisible(second)?second:null))return;
        String[] titles=activity.getResources().getStringArray(R.array.advanced_spotlight_step_titles);
        String[] bodies=activity.getResources().getStringArray(R.array.advanced_spotlight_step_bodies);
        int offset=chapter*2;
        if(titles.length!=16||bodies.length!=16){
            Toast.makeText(activity,R.string.onboarding_target_unavailable,Toast.LENGTH_LONG).show();
            return;
        }
        // The vendored VSpot exposes onStepChanged; scroll the underlying page before placing the cutout.
        final VSpotView[] visibleTour=new VSpotView[1];
        VSpotView tour=new VSpotView.Builder(activity)
            .setStyle(style(activity))
            .setDismissType(VSpotView.DismissType.NONE)
            .addStep(first,titles[offset],bodies[offset])
            .addStep(second,titles[offset+1],bodies[offset+1])
            .setCallback(new VSpotView.Callback(){
                @Override public void onStepChanged(View view,int index,VSpotView.Step step){
                    revealAdvancedTarget(view,visibleTour[0]);
                }
                @Override public void onDismiss(View last,boolean completed,int index){
                    if(activity.isFinishing()||activity.isDestroyed())return;
                    if(completed)OnboardingStore.markAdvancedRead(activity,chapter);
                    else OnboardingStore.skipAdvanced(activity);
                }
            }).build();
        visibleTour[0]=tour;
        tour.show();
    }

    /** Bring a long-form setting into its ScrollView without activating the highlighted control. */
    static boolean revealAdvancedTarget(View view,VSpotView overlay){
        if(view==null||!view.isShown()||view.getWidth()<=0||view.getHeight()<=0)return false;
        Rect targetBounds=new Rect(0,0,view.getWidth(),view.getHeight());
        boolean moved=view.requestRectangleOnScreen(targetBounds,true);
        if(moved&&overlay!=null&&overlay.isShowing())overlay.requestLayout();
        return moved;
    }

    private static boolean advancedVisible(View view){
        return view!=null&&view.isShown()&&view.getWidth()>0&&view.getHeight()>0;
    }

    private static String[] advancedTargetTags(int chapter){
        switch(chapter){
            case 0:return new String[]{ADV_SOURCE_CHOICES,ADV_SOURCE_HOST};
            case 1:return new String[]{ADV_PREFERENCE_TAGS,ADV_PREFERENCE_SAVE};
            case 3:return new String[]{ADV_PAIR_SCAN,ADV_PAIR_MANUAL};
            case 4:return new String[]{ADV_REMOTE_TARGET,ADV_REMOTE_VENDOR};
            case 5:return new String[]{ADV_DOWNLOAD_TASKS,ADV_DOWNLOAD_STORAGE};
            case 6:return new String[]{ADV_PROFILE_RUNTIME,ADV_PROFILE_EVIDENCE};
            case 7:return new String[]{ADV_UPDATE_STATUS,ADV_UPDATE_CHECK};
            default:return null;
        }
    }

    static void maybePrompt(HomeActivity activity){
        if(!OnboardingStore.shouldPrompt(activity))return;
        showWelcome(activity);
    }

    static void showWelcome(HomeActivity activity){
        if(activity.isFinishing()||activity.isDestroyed())return;
        CheckBox never=new CheckBox(activity);
        never.setText(activity.getString(R.string.onboarding_never));
        never.setTextColor(Ui.TEXT);
        int pad=Ui.dp(activity,8);
        never.setPadding(pad,pad,pad,pad);

        AlertDialog dialog=new AlertDialog.Builder(activity)
            .setTitle(R.string.onboarding_welcome_title)
            .setMessage(R.string.onboarding_welcome_body)
            .setView(never)
            .setNegativeButton(R.string.onboarding_later,(d,w)->{
                if(never.isChecked())OnboardingStore.neverAuto(activity);
                else OnboardingStore.later();
            })
            .setPositiveButton(R.string.onboarding_start,(d,w)->{
                if(never.isChecked())OnboardingStore.setAutoShow(activity,false);
                activity.startOnboardingTour();
            })
            .setNeutralButton(R.string.advanced_guide_title,(d,w)->{
                if(never.isChecked())OnboardingStore.setAutoShow(activity,false);
                OnboardingStore.later();
                activity.startActivity(new Intent(activity,AdvancedGuideActivity.class));
            })
            .setOnCancelListener(d->{
                if(never.isChecked())OnboardingStore.neverAuto(activity);
                else OnboardingStore.later();
            })
            .create();
        dialog.show();
    }

    static void start(HomeActivity activity){
        OnboardingStore.replay();
        activity.onboardingShowTab(0,()->showBottomTour(activity));
    }

    private static VSpotView.Style style(Activity activity){
        VSpotView.Style style=new VSpotView.Style();
        style.overlayColor=0xD9000000;
        style.cardColor=Ui.SURFACE;
        style.cardStrokeColor=Ui.OUTLINE;
        style.titleColor=Ui.TEXT;
        style.contentColor=Ui.MUTED;
        style.accentColor=Ui.PRIMARY;
        style.stepBadgeColor=Ui.PRIMARY;
        style.stepBadgeTextColor=Ui.SURFACE;
        style.targetStrokeColor=Ui.PRIMARY;
        style.connectorColor=Ui.PRIMARY;
        style.targetPulseColor=0x446750A4;
        style.showPreviousButton=true;
        style.showSkipButton=true;
        // VSpot 4.0.0 hard-codes the accessibility phrase "Step x of y".
        // Hide its step indicator so non-English accessibility output stays localized.
        style.showStepIndicator=false;
        style.previousButtonText=activity.getString(R.string.onboarding_back);
        style.nextButtonText=activity.getString(R.string.onboarding_next);
        style.doneButtonText=activity.getString(R.string.onboarding_done);
        style.skipButtonText=activity.getString(R.string.onboarding_skip);
        style.maxMessageWidthDp=340;
        return style;
    }

    private static View target(Activity activity,String tag){
        return activity.getWindow().getDecorView().findViewWithTag(tag);
    }

    private static boolean ready(View... views){
        if(views==null||views.length==0)return false;
        for(View view:views)if(view==null)return false;
        return true;
    }
    private static boolean awaitTargets(Activity activity,Runnable retry,View... views){
        return awaitTargets(activity,retry,false,views);
    }
    private static boolean awaitTargets(Activity activity,Runnable retry,boolean advanced,View... views){
        if(activity.isFinishing()||activity.isDestroyed()){pendingTargets.remove(activity);return false;}
        if(ready(views)){pendingTargets.remove(activity);return true;}
        int attempts=pendingTargets.getOrDefault(activity,0)+1;
        // Dynamic recommendation/library panels can take longer than the daily shell to render.
        // Keep retries bounded, and never mark an unavailable advanced tour as completed.
        if(attempts>=(advanced?50:20)){
            pendingTargets.remove(activity);
            if(!advanced)OnboardingStore.later();
            Toast.makeText(activity,R.string.onboarding_target_unavailable,Toast.LENGTH_LONG).show();
            return false;
        }
        pendingTargets.put(activity,attempts);
        activity.getWindow().getDecorView().postDelayed(()->{if(!activity.isFinishing()&&!activity.isDestroyed())retry.run();else pendingTargets.remove(activity);},120);
        return false;
    }

    private static void showBottomTour(HomeActivity activity){
        View library=target(activity,NAV_LIBRARY);
        View recommend=target(activity,NAV_RECOMMEND);
        View online=target(activity,NAV_ONLINE);
        View settings=target(activity,NAV_SETTINGS);
        if(!awaitTargets(activity,()->showBottomTour(activity),library,recommend,online,settings))return;
        VSpotView tour=new VSpotView.Builder(activity)
            .setStyle(style(activity))
            .setDismissType(VSpotView.DismissType.NONE)
            .addStep(library,activity.getString(R.string.tour_library_title),activity.getString(R.string.tour_library_body))
            .addStep(recommend,activity.getString(R.string.tour_recommend_title),activity.getString(R.string.tour_recommend_body))
            .addStep(online,activity.getString(R.string.tour_online_title),activity.getString(R.string.tour_online_body))
            .addStep(settings,activity.getString(R.string.tour_settings_title),activity.getString(R.string.tour_settings_body))
            .setCallback(new VSpotView.Callback(){
                @Override public void onDismiss(View last,boolean completed,int index){
                    if(activity.isFinishing()||activity.isDestroyed())return;
                    if(completed)activity.onboardingShowTab(0,()->showLibraryWorkflowTour(activity));
                    else handleSkip(activity);
                }
            })
            .build();
        tour.show();
    }

    private static void showLibraryWorkflowTour(HomeActivity activity){
        View shelves=target(activity,LIBRARY_SHELVES);
        View refresh=target(activity,LIBRARY_REFRESH);
        if(!awaitTargets(activity,()->showLibraryWorkflowTour(activity),shelves,refresh))return;
        new VSpotView.Builder(activity)
            .setStyle(style(activity))
            .setDismissType(VSpotView.DismissType.NONE)
            .addStep(shelves,activity.getString(R.string.tour_shelf_workflow_title),activity.getString(R.string.tour_shelf_workflow_body))
            .addStep(refresh,activity.getString(R.string.tour_library_refresh_title),activity.getString(R.string.tour_library_refresh_body))
            .setCallback(new VSpotView.Callback(){
                @Override public void onDismiss(View last,boolean completed,int index){
                    if(activity.isFinishing()||activity.isDestroyed())return;
                    if(completed)activity.onboardingShowTab(1,()->showRecommendationWorkflowTour(activity));
                    else handleSkip(activity);
                }
            }).build().show();
    }

    private static void showRecommendationWorkflowTour(HomeActivity activity){
        View build=target(activity,RECOMMEND_BUILD);
        View preferences=target(activity,RECOMMEND_PREFERENCES);
        if(!awaitTargets(activity,()->showRecommendationWorkflowTour(activity),build,preferences))return;
        new VSpotView.Builder(activity)
            .setStyle(style(activity))
            .setDismissType(VSpotView.DismissType.NONE)
            .addStep(build,activity.getString(R.string.tour_generate_recommend_title),activity.getString(R.string.tour_generate_recommend_body))
            .addStep(preferences,activity.getString(R.string.tour_adjust_recommend_title),activity.getString(R.string.tour_adjust_recommend_body))
            .setCallback(new VSpotView.Callback(){
                @Override public void onDismiss(View last,boolean completed,int index){
                    if(activity.isFinishing()||activity.isDestroyed())return;
                    if(completed){
                        OnboardingStore.complete(activity);
                        new AlertDialog.Builder(activity).setTitle(R.string.tour_complete_title).setMessage(R.string.tour_complete_body).setPositiveButton(R.string.common_ok,null).show();
                    }
                    else handleSkip(activity);
                }
            }).build().show();
    }

    private static void showSettingsTour(HomeActivity activity){
        View recommend=target(activity,SETTINGS_RECOMMEND);
        View pair=target(activity,SETTINGS_PAIR);
        View language=target(activity,SETTINGS_LANGUAGE);
        View update=target(activity,SETTINGS_UPDATE);
        View help=target(activity,SETTINGS_HELP);
        if(!awaitTargets(activity,()->showSettingsTour(activity),recommend,pair,language,update,help))return;
        VSpotView tour=new VSpotView.Builder(activity)
            .setStyle(style(activity))
            .setDismissType(VSpotView.DismissType.NONE)
            .addStep(recommend,activity.getString(R.string.tour_recommend_settings_title),activity.getString(R.string.tour_recommend_settings_body))
            .addStep(pair,activity.getString(R.string.tour_pair_title),activity.getString(R.string.tour_pair_body))
            .addStep(language,activity.getString(R.string.tour_language_title),activity.getString(R.string.tour_language_body))
            .addStep(update,activity.getString(R.string.tour_update_title),activity.getString(R.string.tour_update_body))
            .addStep(help,activity.getString(R.string.tour_help_title),activity.getString(R.string.tour_help_body))
            .setCallback(new VSpotView.Callback(){
                @Override public void onDismiss(View last,boolean completed,int index){
                    if(activity.isFinishing()||activity.isDestroyed())return;
                    if(completed){
                        Intent intent=new Intent(activity,RecommendationStyleActivity.class);
                        intent.putExtra("startDetailedOnboarding",true);
                        activity.startActivity(intent);
                    }else handleSkip(activity);
                }
            })
            .build();
        tour.show();
    }

    static void startRecommendationStyleTour(RecommendationStyleActivity activity){
        View profile=target(activity,REC_PROFILE),adjust=target(activity,REC_ADJUST),sync=target(activity,REC_SYNC),visualMode=target(activity,REC_VISUAL_MODE),visualStrength=target(activity,REC_VISUAL_STRENGTH);
        if(!awaitTargets(activity,()->startRecommendationStyleTour(activity),true,profile,adjust,sync,visualMode,visualStrength))return;
        new VSpotView.Builder(activity)
            .setStyle(style(activity))
            .setDismissType(VSpotView.DismissType.NONE)
            .addStep(profile,activity.getString(R.string.tour_profile_title),activity.getString(R.string.tour_profile_body))
            .addStep(adjust,activity.getString(R.string.tour_manual_adjust_title),activity.getString(R.string.tour_manual_adjust_body))
            .addStep(sync,activity.getString(R.string.tour_recommend_sync_title),activity.getString(R.string.tour_recommend_sync_body))
            .addStep(visualMode,activity.getString(R.string.tour_visual_mode_title),activity.getString(R.string.tour_visual_mode_body))
            .addStep(visualStrength,activity.getString(R.string.tour_visual_strength_title),activity.getString(R.string.tour_visual_strength_body))
            .setCallback(new VSpotView.Callback(){
                @Override public void onDismiss(View last,boolean completed,int index){
                    if(activity.isFinishing()||activity.isDestroyed())return;
                    if(completed){
                        OnboardingStore.completeAdvanced(activity);
                        OnboardingStore.markAdvancedRead(activity,2);
                        new AlertDialog.Builder(activity).setTitle(R.string.advanced_guide_title).setMessage(R.string.advanced_guide_spotlight_done).setPositiveButton(R.string.common_ok,null).show();
                    }else handleSkip(activity,true);
                }
            }).build().show();
    }

    private static void handleSkip(Activity activity){
        handleSkip(activity,false);
    }
    private static void handleSkip(Activity activity,boolean advanced){
        if(advanced)OnboardingStore.skipAdvanced(activity);
        else OnboardingStore.skip(activity);
        new AlertDialog.Builder(activity)
            .setTitle(R.string.onboarding_skip)
            .setMessage(R.string.onboarding_skip_notice)
            .setPositiveButton(R.string.common_ok,null)
            .show();
    }
}
