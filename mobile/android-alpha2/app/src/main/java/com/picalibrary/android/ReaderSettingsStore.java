package com.picalibrary.android;

import android.content.Context;
import android.content.SharedPreferences;
import java.time.Instant;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Portable reader preferences. Local state is immediate; WebDAV reconciles by timestamp. */
final class ReaderSettingsStore {
    static final class Snapshot {
        final int mode;
        final boolean keepOn;
        final String updatedAt;
        Snapshot(int mode,boolean keepOn,String updatedAt){this.mode=mode;this.keepOn=keepOn;this.updatedAt=updatedAt==null?"":updatedAt;}
    }

    private static final String PREFS="reader-display";
    private static final String UPDATED="portableUpdatedAt";
    private static final ExecutorService SYNC=Executors.newSingleThreadExecutor();
    private ReaderSettingsStore(){}

    static Snapshot local(Context context){
        SharedPreferences p=context.getSharedPreferences(PREFS,Context.MODE_PRIVATE);int mode=p.getInt("mode",0);if(mode<0||mode>2)mode=0;return new Snapshot(mode,p.getBoolean("keepOn",true),p.getString(UPDATED,""));
    }

    static Snapshot saveLocal(Context context,int mode,boolean keepOn){
        int safe=mode<0||mode>2?0:mode;String now=Instant.now().toString();context.getSharedPreferences(PREFS,Context.MODE_PRIVATE).edit().putInt("mode",safe).putBoolean("keepOn",keepOn).putString(UPDATED,now).apply();return new Snapshot(safe,keepOn,now);
    }

    private static Snapshot applyRemote(Context context,RemoteLibraryClient.ReaderSettings remote){
        context.getSharedPreferences(PREFS,Context.MODE_PRIVATE).edit().putInt("mode",remote.mode).putBoolean("keepOn",remote.keepOn).putString(UPDATED,remote.updatedAt).apply();return new Snapshot(remote.mode,remote.keepOn,remote.updatedAt);
    }

    static Snapshot reconcile(Context context){
        Context app=context.getApplicationContext();Snapshot local=local(app);if(!RemoteConfigStore.load(app).configured())return local;
        try{
            RemoteLibraryClient client=new RemoteLibraryClient(app);RemoteLibraryClient.ReaderSettings remote=client.readerSettings();
            if(remote!=null&&remote.updatedAt.compareTo(local.updatedAt)>0)return applyRemote(app,remote);
            if(local.updatedAt.isEmpty())local=saveLocal(app,local.mode,local.keepOn);
            RemoteLibraryClient.ReaderSettings effective=client.saveReaderSettings(DeviceIdentity.id(app),local.mode,local.keepOn,local.updatedAt);
            if(effective!=null&&effective.updatedAt.compareTo(local.updatedAt)>0)return applyRemote(app,effective);
            return local;
        }catch(Exception ignored){return local;}
    }

    static void pushAsync(Context context){Context app=context.getApplicationContext();SYNC.submit(()->reconcile(app));}
}
