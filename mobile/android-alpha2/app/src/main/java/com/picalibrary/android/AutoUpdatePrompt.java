package com.picalibrary.android;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

/** Foreground update notice backed by the existing signed OTA manifest. */
final class AutoUpdatePrompt {
    private static final String PREF="updater-v1";
    private static final long CHECK_INTERVAL_MS=6L*60*60*1000;
    private static final long PROMPT_INTERVAL_MS=12L*60*60*1000;
    private static final AtomicBoolean CHECKING=new AtomicBoolean(false);
    private static final ExecutorService IO=Executors.newSingleThreadExecutor();
    private AutoUpdatePrompt(){}

    static void maybePrompt(Activity activity){
        if(activity==null||activity.isFinishing()||activity.isDestroyed())return;
        SharedPreferences prefs=activity.getSharedPreferences(PREF,Context.MODE_PRIVATE);
        int latestCode=prefs.getInt("latestVersionCode",-1);
        if(latestCode>UpdateClient.currentVersionCode(activity))showCached(activity,prefs,latestCode);
        long now=System.currentTimeMillis(),last=prefs.getLong("lastAutoCheckAt",0);
        if(now-last<CHECK_INTERVAL_MS||!CHECKING.compareAndSet(false,true))return;
        IO.execute(()->{
            try{
                UpdateClient.Info info=UpdateClient.check(activity.getApplicationContext());
                activity.getSharedPreferences(PREF,Context.MODE_PRIVATE).edit()
                    .putLong("lastAutoCheckAt",System.currentTimeMillis())
                    .putInt("latestVersionCode",info.versionCode)
                    .putString("latestVersionName",info.versionName)
                    .putString("latestNotes",info.notes)
                    .apply();
                if(UpdateClient.newer(activity,info))activity.runOnUiThread(()->show(activity,info.versionCode,info.versionName));
            }catch(Exception e){
                activity.getSharedPreferences(PREF,Context.MODE_PRIVATE).edit().putLong("lastAutoCheckAt",System.currentTimeMillis()).apply();
            }finally{CHECKING.set(false);}
        });
    }

    private static void showCached(Activity activity,SharedPreferences prefs,int code){
        String name=prefs.getString("latestVersionName","");
        activity.runOnUiThread(()->show(activity,code,name==null?"":name));
    }

    private static void show(Activity activity,int code,String versionName){
        if(activity.isFinishing()||activity.isDestroyed()||code<=UpdateClient.currentVersionCode(activity))return;
        SharedPreferences prefs=activity.getSharedPreferences(PREF,Context.MODE_PRIVATE);
        long now=System.currentTimeMillis();
        if(prefs.getInt("lastPromptedVersionCode",-1)==code&&now-prefs.getLong("lastPromptedAt",0)<PROMPT_INTERVAL_MS)return;
        prefs.edit().putInt("lastPromptedVersionCode",code).putLong("lastPromptedAt",now).apply();
        ((android.app.NotificationManager)activity.getSystemService(Context.NOTIFICATION_SERVICE)).cancel(0x55410001);
        String version=(versionName==null||versionName.trim().isEmpty())?("v"+code):versionName.trim();
        new AlertDialog.Builder(activity)
            .setTitle(LocalizedText.ui(activity,"发现新版本","Update available","新しいバージョンがあります"))
            .setMessage(LocalizedText.ui(activity,
                "Pica Library "+version+" 已发布。现在可以进入软件更新页查看说明并安装。",
                "Pica Library "+version+" is available. Open Software Update to review the release and install it.",
                "Pica Library "+version+" が利用できます。ソフトウェア更新を開いて内容を確認し、インストールできます。"))
            .setNegativeButton(LocalizedText.ui(activity,"稍后","Later","あとで"),null)
            .setPositiveButton(LocalizedText.ui(activity,"去更新","Open Update","更新を開く"),(d,w)->activity.startActivity(new Intent(activity,UpdateActivity.class)))
            .show();
    }
}
