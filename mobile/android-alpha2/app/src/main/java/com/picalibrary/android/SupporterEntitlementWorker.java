package com.picalibrary.android;

import android.content.Context;
import androidx.annotation.NonNull;
import androidx.work.*;

/** Desktop pairing syncs the signed entitlement and then the validated active theme. */
public final class SupporterEntitlementWorker extends Worker {
    public SupporterEntitlementWorker(@NonNull Context context,@NonNull WorkerParameters params){super(context,params);}
    @NonNull @Override public Result doWork(){Context c=getApplicationContext();if(!BridgeStore.paired(c))return Result.success();try{ThemePackSync.sync(c);}catch(Exception ignored){}return Result.success();}
}