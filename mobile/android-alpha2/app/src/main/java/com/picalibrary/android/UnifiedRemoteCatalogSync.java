package com.picalibrary.android;

import android.content.Context;
import java.time.Instant;
import org.json.JSONObject;

/** Avoids re-reading an unchanged WebDAV generation and preserves cached remote availability. */
final class UnifiedRemoteCatalogSync {
    private UnifiedRemoteCatalogSync(){}

    static UnifiedCatalogStore.Snapshot refresh(Context context) throws Exception {
        UnifiedCatalogStore.Snapshot current=UnifiedCatalogStore.load(context);
        RemoteLibraryClient client=new RemoteLibraryClient(context);
        JSONObject pointer=client.json("v1/control/current.json");
        String generation=pointer.optString("generation","");
        String catalogPath=pointer.optString("catalogPath","");
        if(catalogPath.isEmpty())throw new IllegalStateException("云端书库尚未发布");
        if(!generation.isEmpty()&&generation.equals(current.remoteGeneration))return current;
        return UnifiedCatalogStore.refreshRemote(context);
    }
}
