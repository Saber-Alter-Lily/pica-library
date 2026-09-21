package com.picalibrary.android;

import android.app.Activity;
import android.app.Application;
import android.content.Context;
import android.content.pm.ApplicationInfo;
import android.content.res.Configuration;
import android.os.Bundle;

/** Application entrypoint for appearance, update checks and lightweight maintenance jobs. */
public final class PicaLibraryApp extends Application {
    @Override protected void attachBaseContext(Context base){super.attachBaseContext(LocaleStore.wrap(base));}
    @Override public void onCreate(){
        super.onCreate();
        ThemeStore.applyPlatformNightMode(this,ThemeStore.mode(this));
        Ui.applyTheme(this);
        PreviewAccess.installIfEligible(this);
        Ui.applyTheme(this);
        getSharedPreferences("alpha81-ui",MODE_PRIVATE).edit().remove("libraryRefreshed").apply();
        registerActivityLifecycleCallbacks(new ActivityLifecycleCallbacks(){
            @Override public void onActivityCreated(Activity activity,Bundle state){if(activity instanceof HomeActivity)getSharedPreferences("alpha81-ui",MODE_PRIVATE).edit().remove("libraryRefreshed").apply();}
            @Override public void onActivityStarted(Activity activity){}
            @Override public void onActivityResumed(Activity activity){if(ThemeStore.MODE_SYSTEM.equals(ThemeStore.mode(activity)))ThemeStore.applyPlatformNightMode(activity,ThemeStore.MODE_SYSTEM);Ui.applyTheme(activity);}
            @Override public void onActivityPaused(Activity activity){}
            @Override public void onActivityStopped(Activity activity){}
            @Override public void onActivitySaveInstanceState(Activity activity,Bundle state){}
            @Override public void onActivityDestroyed(Activity activity){}
        });
        // Side-by-side Dev builds are manual QA artifacts and must not consume the formal OTA channel.
        boolean debuggable=(getApplicationInfo().flags&ApplicationInfo.FLAG_DEBUGGABLE)!=0;
        if(!debuggable)UpdateCheckJobs.schedule(this);
        if(PicaAccountStore.load(this).configured())PicaBootstrapJobs.enqueue(this);
        SupporterSyncJobs.enqueue(this);
        StoragePolicy.maintain(this);
    }
    @Override public void onConfigurationChanged(Configuration next){super.onConfigurationChanged(next);Ui.applyTheme(this);}
}
