package com.picalibrary.android;

import android.app.*;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.work.*;

/** Builds a mobile-native Recommendation V3 cycle without depending on Desktop. */
public final class NativeRecommendationWorker extends Worker {
    static final String KEY_PHASE="phase",KEY_DONE="done",KEY_TOTAL="total";
    private static final String CHANNEL="native-recommendation";
    public NativeRecommendationWorker(@NonNull Context context,@NonNull WorkerParameters params){super(context,params);}

    @NonNull @Override public Result doWork(){
        try{
            setForegroundAsync(foreground("正在准备手机推荐",0,0));
            NativeRecommendationStore.Snapshot snapshot=NativeRecommendationEngine.build(getApplicationContext(),(phase,done,total)->{
                Data data=new Data.Builder().putString(KEY_PHASE,phase).putInt(KEY_DONE,done).putInt(KEY_TOTAL,total).build();setProgressAsync(data);setForegroundAsync(foreground(phase,done,total));
            });
            if(!snapshot.available()&&NativeRecommendationPolicy.readinessRank(snapshot.candidateCount)==0){
                return Result.failure(new Data.Builder().putString(KEY_PHASE,"候选池不足："+snapshot.candidateCount+" 本").putInt(KEY_DONE,snapshot.candidateCount).putInt(KEY_TOTAL,NativeRecommendationPolicy.TARGET_POOL).build());
            }
            return Result.success(new Data.Builder().putString(KEY_PHASE,"手机原生 Recommendation V3 已更新").putInt(KEY_DONE,snapshot.batches.size()).putInt(KEY_TOTAL,NativeRecommendationPolicy.MAX_BATCHES).build());
        }catch(Exception e){
            String message=e.getMessage()==null?"手机推荐生成失败":e.getMessage();
            if(getRunAttemptCount()<2)return Result.retry();
            return Result.failure(new Data.Builder().putString(KEY_PHASE,message).build());
        }
    }

    private ForegroundInfo foreground(String text,int done,int total){
        NotificationManager manager=(NotificationManager)getApplicationContext().getSystemService(Context.NOTIFICATION_SERVICE);
        if(Build.VERSION.SDK_INT>=26)manager.createNotificationChannel(new NotificationChannel(CHANNEL,"Pica Library 手机推荐",NotificationManager.IMPORTANCE_LOW));
        Intent intent=new Intent(getApplicationContext(),MainActivity.class);intent.putExtra("openTab",1);
        PendingIntent pending=PendingIntent.getActivity(getApplicationContext(),0x5531,intent,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        NotificationCompat.Builder b=new NotificationCompat.Builder(getApplicationContext(),CHANNEL).setSmallIcon(android.R.drawable.stat_notify_sync).setContentTitle("手机原生 Recommendation V3").setContentText(text).setContentIntent(pending).setOnlyAlertOnce(true).setOngoing(true);
        if(total>0)b.setProgress(total,Math.max(0,Math.min(done,total)),false);else b.setProgress(0,0,true);
        Notification notification=b.build();
        if(Build.VERSION.SDK_INT>=29)return new ForegroundInfo(0x55310001,notification,ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
        return new ForegroundInfo(0x55310001,notification);
    }
}