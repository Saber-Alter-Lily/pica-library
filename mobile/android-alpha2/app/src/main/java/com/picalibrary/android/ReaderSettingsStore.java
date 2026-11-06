package com.picalibrary.android;

import android.content.Context;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Legacy WebDAV synchronization adapter; :reader-view owns the original local settings. */
final class ReaderSettingsStore extends ReaderDisplaySettings {
    private static final ExecutorService SYNC=Executors.newSingleThreadExecutor();
    private ReaderSettingsStore(){}

    private static Snapshot applyRemote(Context context,RemoteLibraryClient.ReaderSettings remote){
        return ReaderDisplaySettings.applyRemote(context,remote.mode,remote.keepOn,remote.updatedAt);
    }

    static Snapshot reconcile(Context context){
        Context app=context.getApplicationContext();Snapshot local=local(app);if(BuildConfig.LOCAL_ONLY_DRAFT||!RemoteConfigStore.load(app).configured())return local;
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
