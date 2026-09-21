package com.picalibrary.android;

import android.app.AlertDialog;
import android.content.DialogInterface;
import android.view.View;
import android.widget.CheckBox;
import android.widget.LinearLayout;
import android.widget.TextView;
import com.developer.spoti.vspoti.VSpotView;

/** Two-stage VSpot tour: persistent bottom navigation first, then stable Settings rows. */
final class AndroidOnboarding {
    static final String NAV_LIBRARY="pica-tour-nav-0";
    static final String NAV_RECOMMEND="pica-tour-nav-1";
    static final String NAV_ONLINE="pica-tour-nav-2";
    static final String NAV_SETTINGS="pica-tour-nav-3";
    static final String SETTINGS_RECOMMEND="pica-tour-settings-recommend";
    static final String SETTINGS_PAIR="pica-tour-settings-pair";
    static final String SETTINGS_LANGUAGE="pica-tour-settings-language";
    static final String SETTINGS_UPDATE="pica-tour-settings-update";
    static final String SETTINGS_HELP="pica-tour-settings-help";

    private AndroidOnboarding(){}

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

    private static VSpotView.Style style(HomeActivity activity){
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

    private static View target(HomeActivity activity,String tag){
        return activity.getWindow().getDecorView().findViewWithTag(tag);
    }

    private static boolean ready(View... views){
        if(views==null||views.length==0)return false;
        for(View view:views)if(view==null)return false;
        return true;
    }

    private static void showBottomTour(HomeActivity activity){
        View library=target(activity,NAV_LIBRARY);
        View recommend=target(activity,NAV_RECOMMEND);
        View online=target(activity,NAV_ONLINE);
        View settings=target(activity,NAV_SETTINGS);
        if(!ready(library,recommend,online,settings)){
            activity.getWindow().getDecorView().postDelayed(()->showBottomTour(activity),120);
            return;
        }
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
                    if(completed)activity.onboardingShowTab(3,()->showSettingsTour(activity));
                    else handleSkip(activity);
                }
            })
            .build();
        tour.show();
    }

    private static void showSettingsTour(HomeActivity activity){
        View recommend=target(activity,SETTINGS_RECOMMEND);
        View pair=target(activity,SETTINGS_PAIR);
        View language=target(activity,SETTINGS_LANGUAGE);
        View update=target(activity,SETTINGS_UPDATE);
        View help=target(activity,SETTINGS_HELP);
        if(!ready(recommend,pair,language,update,help)){
            activity.getWindow().getDecorView().postDelayed(()->showSettingsTour(activity),120);
            return;
        }
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
                        OnboardingStore.complete(activity);
                        new AlertDialog.Builder(activity)
                            .setTitle(R.string.tour_complete_title)
                            .setMessage(R.string.tour_complete_body)
                            .setPositiveButton(R.string.common_ok,null)
                            .show();
                    }else handleSkip(activity);
                }
            })
            .build();
        tour.show();
    }

    private static void handleSkip(HomeActivity activity){
        OnboardingStore.skip(activity);
        new AlertDialog.Builder(activity)
            .setTitle(R.string.onboarding_skip)
            .setMessage(R.string.onboarding_skip_notice)
            .setPositiveButton(R.string.common_ok,null)
            .show();
    }
}
