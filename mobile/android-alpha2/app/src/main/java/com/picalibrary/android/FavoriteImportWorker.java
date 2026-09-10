package com.picalibrary.android;

import android.app.*;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.work.*;

/** Favorites/cover import detached from Activity lifecycle; cover runs are promoted to foreground work. */
public final class FavoriteImportWorker extends Worker {
    static final String KEY_COVERS="covers",KEY_DONE="done",KEY_TOTAL="total",KEY_PHASE="phase";private static final String CHANNEL="library-background";
    public FavoriteImportWorker(@NonNull Context context,@NonNull WorkerParameters params){super(context,params);}
    @NonNull @Override public Result doWork(){boolean covers=getInputData().getBoolean(KEY_COVERS,false);try{if(covers)setForegroundAsync(foreground("正在导入收藏与封面",0,0));FavoriteCacheStore.Snapshot snapshot=FavoriteCacheStore.syncFromDesktop(getApplicationContext(),covers,(done,total,phase)->{Data data=new Data.Builder().putInt(KEY_DONE,done).putInt(KEY_TOTAL,total).putString(KEY_PHASE,phase).build();setProgressAsync(data);if(covers)setForegroundAsync(foreground(phase,done,total));});UnifiedCatalogStore.reconcileLocalReferences(getApplicationContext());return Result.success(new Data.Builder().putInt(KEY_DONE,snapshot.items.size()).putInt(KEY_TOTAL,snapshot.items.size()).putString(KEY_PHASE,covers?"收藏和封面后台导入完成":"收藏后台导入完成").build());}catch(Exception e){if(getRunAttemptCount()<3)return Result.retry();return Result.failure(new Data.Builder().putString(KEY_PHASE,e.getMessage()==null?"收藏导入失败":e.getMessage()).build());}}
    private ForegroundInfo foreground(String text,int done,int total){NotificationManager manager=(NotificationManager)getApplicationContext().getSystemService(Context.NOTIFICATION_SERVICE);if(Build.VERSION.SDK_INT>=26)manager.createNotificationChannel(new NotificationChannel(CHANNEL,"Pica Library 后台任务",NotificationManager.IMPORTANCE_LOW));Intent intent=new Intent(getApplicationContext(),TaskCenterActivity.class);PendingIntent pending=PendingIntent.getActivity(getApplicationContext(),1,intent,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);NotificationCompat.Builder b=new NotificationCompat.Builder(getApplicationContext(),CHANNEL).setSmallIcon(android.R.drawable.stat_sys_download).setContentTitle("收藏与封面导入").setContentText(text).setContentIntent(pending).setOnlyAlertOnce(true).setOngoing(true);if(total>0)b.setProgress(total,Math.min(done,total),false);else b.setProgress(0,0,true);Notification n=b.build();if(Build.VERSION.SDK_INT>=29)return new ForegroundInfo(0x53100001,n,ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);return new ForegroundInfo(0x53100001,n);}
}
