package com.picalibrary.android;

import android.Manifest;
import android.app.*;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;
import androidx.work.*;

/** Background metadata-only update check. APK download/install still starts from UpdateActivity. */
public final class UpdateCheckWorker extends Worker {
    private static final String PREF="updater-v1",CHANNEL="app-updates";
    private static final long MIN_CHECK_INTERVAL_MS=6L*60*60*1000;
    public UpdateCheckWorker(@NonNull Context context,@NonNull WorkerParameters params){super(context,params);}

    @NonNull @Override public Result doWork(){
        Context app=getApplicationContext();long now=System.currentTimeMillis(),last=app.getSharedPreferences(PREF,Context.MODE_PRIVATE).getLong("lastAutoCheckAt",0);
        if(now-last<MIN_CHECK_INTERVAL_MS)return Result.success();
        try{
            UpdateClient.Info info=UpdateClient.check(app);app.getSharedPreferences(PREF,Context.MODE_PRIVATE).edit().putLong("lastAutoCheckAt",now).putInt("latestVersionCode",info.versionCode).putString("latestVersionName",info.versionName).putString("latestNotes",info.notes).apply();
            if(UpdateClient.newer(app,info))notifyUpdate(app,info);return Result.success();
        }catch(Exception e){app.getSharedPreferences(PREF,Context.MODE_PRIVATE).edit().putLong("lastAutoCheckAt",now).apply();return Result.success();}
    }

    private static void notifyUpdate(Context context,UpdateClient.Info info){
        if(Build.VERSION.SDK_INT>=33&&ContextCompat.checkSelfPermission(context,Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)return;
        NotificationManager manager=(NotificationManager)context.getSystemService(Context.NOTIFICATION_SERVICE);if(Build.VERSION.SDK_INT>=26)manager.createNotificationChannel(new NotificationChannel(CHANNEL,"Pica Library 更新",NotificationManager.IMPORTANCE_LOW));
        Intent intent=new Intent(context,UpdateActivity.class);PendingIntent pending=PendingIntent.getActivity(context,0x5541,intent,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);Notification notification=new NotificationCompat.Builder(context,CHANNEL).setSmallIcon(android.R.drawable.stat_sys_download_done).setContentTitle("Pica Library 有新版本").setContentText(info.versionName+" · 点此查看并更新").setStyle(new NotificationCompat.BigTextStyle().bigText(info.notes==null||info.notes.isEmpty()?info.versionName:info.notes)).setContentIntent(pending).setAutoCancel(true).setOnlyAlertOnce(true).build();manager.notify(0x55410001,notification);
    }
}
