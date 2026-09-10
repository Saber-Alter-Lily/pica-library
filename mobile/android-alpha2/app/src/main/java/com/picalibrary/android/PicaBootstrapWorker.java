package com.picalibrary.android;

import android.content.Context;
import androidx.annotation.NonNull;
import androidx.work.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;

/** Pulls lightweight Pica favorite metadata into the unified catalog after account login. */
public final class PicaBootstrapWorker extends Worker {
    static final String KEY_PHASE="phase",KEY_TOTAL="total";
    public PicaBootstrapWorker(@NonNull Context context,@NonNull WorkerParameters params){super(context,params);}

    @NonNull @Override public Result doWork(){
        try{
            Context app=getApplicationContext();if(isStopped()||!PicaAccountStore.load(app).configured())return Result.failure();
            setProgressAsync(new Data.Builder().putString(KEY_PHASE,"正在导入 Pica 收藏元数据").build());
            PicaClient client=new PicaClient(app);List<PicaClient.Comic> favorites=client.favoritesAll();
            if(isStopped()||!PicaAccountStore.load(app).configured())return Result.failure();
            UnifiedPicaCatalogSync.mergeAll(app,favorites);List<BridgeClient.ComicItem> items=new ArrayList<>();for(PicaClient.Comic comic:favorites)items.add(new BridgeClient.ComicItem(comic.id,comic.title,comic.author,"",0));FavoriteCacheStore.save(app,items,false);UnifiedCatalogStore.reconcileLocalReferences(app);NativeRecommendationStore.invalidateIfFavoriteFingerprintChanged(app,favoriteFingerprint(favorites));
            return Result.success(new Data.Builder().putString(KEY_PHASE,"Pica 收藏元数据已导入").putInt(KEY_TOTAL,favorites.size()).build());
        }catch(Exception e){if(isStopped()||!PicaAccountStore.load(getApplicationContext()).configured())return Result.failure();if(getRunAttemptCount()<2)return Result.retry();return Result.failure(new Data.Builder().putString(KEY_PHASE,e.getMessage()==null?"Pica 收藏导入失败":e.getMessage()).build());}
    }

    private static String favoriteFingerprint(List<PicaClient.Comic> favorites) throws Exception {List<String> ids=new ArrayList<>();for(PicaClient.Comic comic:favorites)if(comic!=null&&!comic.id.isEmpty())ids.add(comic.id);Collections.sort(ids);MessageDigest digest=MessageDigest.getInstance("SHA-256");byte[] bytes=digest.digest(String.join("\n",ids).getBytes(StandardCharsets.UTF_8));StringBuilder out=new StringBuilder();for(byte b:bytes)out.append(String.format(Locale.ROOT,"%02x",b&255));return out.toString();}
}
