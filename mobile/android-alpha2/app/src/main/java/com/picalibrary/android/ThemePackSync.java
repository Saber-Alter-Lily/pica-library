package com.picalibrary.android;

import android.content.Context;
import java.net.URLEncoder;
import org.json.*;

/** Pulls signed supporter entitlement and data-only theme packs from the paired Desktop bridge. */
final class ThemePackSync {
    private ThemePackSync(){}
    static int sync(Context c) throws Exception {
        if(!BridgeStore.paired(c))throw new IllegalStateException("尚未配对 Desktop");
        try{JSONObject star=new JSONObject(BridgeBinaryClient.text(c,"/mobile/v1/star-access",64*1024));StarAccessStore.installSyncedProof(c,star);}catch(Exception ignored){}
        if(!StarAccessStore.enabled(c))throw new SecurityException("给 Pica Library 项目 Star 后即可解锁个性化装扮");
        JSONObject root=new JSONObject(BridgeBinaryClient.text(c,"/mobile/v1/themes",512*1024));JSONArray packs=root.optJSONArray("packs");int installed=0;if(packs!=null)for(int i=0;i<packs.length();i++){JSONObject p=packs.optJSONObject(i);if(p==null)continue;String id=p.optString("id","").trim();if(id.isEmpty())continue;byte[] zip=BridgeBinaryClient.get(c,"/mobile/v1/themes/"+URLEncoder.encode(id,"UTF-8").replace("+","%20"),24*1024*1024);ThemePackStore.install(c,zip);installed++;}
        String active=root.optString("activeThemeId","").trim();if(active.isEmpty())ThemePackStore.deactivate(c);else{try{ThemePackStore.activate(c,active);}catch(Exception ignored){}}
        Ui.applyTheme(c);return installed;
    }
}