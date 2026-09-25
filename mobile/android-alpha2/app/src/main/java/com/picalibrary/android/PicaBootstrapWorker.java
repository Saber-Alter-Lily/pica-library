package com.picalibrary.android;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.work.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;

/** Pulls lightweight Pica favorite metadata into the unified catalog after account login. */
public final class PicaBootstrapWorker extends Worker {
    static final String KEY_PHASE="phase",KEY_DONE="done",KEY_TOTAL="total";
    private static final String CHANNEL="pica-bootstrap";
    public PicaBootstrapWorker(@NonNull Context context,@NonNull WorkerParameters params){super(context,params);}

    @NonNull @Override public Result doWork(){
        try{
            Context app=getApplicationContext();if(isStopped()||!PicaAccountStore.load(app).configured())return Result.failure();
            setForegroundAsync(foreground("正在导入 Pica 收藏元数据",0,0));
            setProgressAsync(new Data.Builder().putString(KEY_PHASE,"正在导入 Pica 收藏元数据").build());
            PicaClient client=new PicaClient(app);List<PicaClient.Comic> favorites=client.favoritesAll((page,pages,fetched,total)->{if(isStopped())throw new InterruptedException("Pica 收藏同步已停止");String phase="正在读取 Pica 收藏 · 第 "+page+" / "+pages+" 页";setProgressAsync(new Data.Builder().putString(KEY_PHASE,phase).putInt(KEY_DONE,fetched).putInt(KEY_TOTAL,total).build());setForegroundAsync(foreground(phase,fetched,total));});
            if(isStopped()||!PicaAccountStore.load(app).configured())return Result.failure(new Data.Builder().putString(KEY_PHASE,PicaBootstrapJobs.paused(app)?"Pica 收藏同步已暂停":"Pica 收藏同步已取消").build());
            UnifiedPicaCatalogSync.mergeAll(app,favorites);EhFavoriteStore.migrateLegacyEhLocals(app);List<BridgeClient.ComicItem> items=new ArrayList<>();for(PicaClient.Comic comic:favorites)items.add(new BridgeClient.ComicItem(comic.id,comic.title,comic.author,"",0));FavoriteCacheStore.save(app,items,false);UnifiedCatalogStore.reconcileLocalReferences(app);NativeRecommendationStore.invalidateIfFavoriteFingerprintChanged(app,favoriteFingerprint(favorites));
            PicaBootstrapJobs.complete(app);
            return Result.success(new Data.Builder().putString(KEY_PHASE,"Pica 收藏元数据已导入").putInt(KEY_DONE,favorites.size()).putInt(KEY_TOTAL,favorites.size()).build());
        }catch(Exception e){if(isStopped()||!PicaAccountStore.load(getApplicationContext()).configured())return Result.failure(new Data.Builder().putString(KEY_PHASE,PicaBootstrapJobs.paused(getApplicationContext())?"Pica 收藏同步已暂停":"Pica 收藏同步已取消").build());if(getRunAttemptCount()<2)return Result.retry();return Result.failure(new Data.Builder().putString(KEY_PHASE,e.getMessage()==null?"Pica 收藏导入失败":e.getMessage()).build());}
    }

    private ForegroundInfo foreground(String text,int done,int total){
        Context app=getApplicationContext();
        NotificationManager manager=(NotificationManager)app.getSystemService(Context.NOTIFICATION_SERVICE);
        if(Build.VERSION.SDK_INT>=26)manager.createNotificationChannel(new NotificationChannel(CHANNEL,"Pica Library 收藏同步",NotificationManager.IMPORTANCE_LOW));
        Intent intent=new Intent(app,TaskCenterActivity.class);
        PendingIntent pending=PendingIntent.getActivity(app,0x5342,intent,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        NotificationCompat.Builder builder=new NotificationCompat.Builder(app,CHANNEL).setSmallIcon(android.R.drawable.stat_notify_sync).setContentTitle("Pica 收藏同步").setContentText(text).setContentIntent(pending).setOnlyAlertOnce(true).setOngoing(true);
        if(total>0)builder.setProgress(total,Math.max(0,Math.min(done,total)),false);else builder.setProgress(0,0,true);
        Notification notification=builder.build();
        if(Build.VERSION.SDK_INT>=29)return new ForegroundInfo(0x53420001,notification,ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
        return new ForegroundInfo(0x53420001,notification);
    }

    private static String favoriteFingerprint(List<PicaClient.Comic> favorites) throws Exception {List<String> ids=new ArrayList<>();for(PicaClient.Comic comic:favorites)if(comic!=null&&!comic.id.isEmpty())ids.add(comic.id);Collections.sort(ids);MessageDigest digest=MessageDigest.getInstance("SHA-256");byte[] bytes=digest.digest(String.join("\n",ids).getBytes(StandardCharsets.UTF_8));StringBuilder out=new StringBuilder();for(byte b:bytes)out.append(String.format(Locale.ROOT,"%02x",b&255));return out.toString();}
}
