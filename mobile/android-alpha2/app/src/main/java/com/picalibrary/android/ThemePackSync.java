package com.picalibrary.android;

import android.content.Context;
import java.net.URLEncoder;
import org.json.*;

/** Pulls authenticated Star proof and data-only theme packs. Active theme remains device-local. */
final class ThemePackSync {
    private ThemePackSync(){}
    static int sync(Context c) throws Exception {
        if(!BridgeStore.paired(c))throw new IllegalStateException("尚未配对 Desktop");
        try{JSONObject star=new JSONObject(BridgeBinaryClient.text(c,"/mobile/v1/star-access",64*1024));StarAccessStore.installSyncedProof(c,star);}catch(Exception ignored){}
        if(!StarAccessStore.enabled(c))throw new SecurityException("请先使用 GitHub 账号验证 Star，或从已配对电脑同步已验证凭证");
        String activeBefore=ThemePackStore.activeId(c);
        JSONObject root=new JSONObject(BridgeBinaryClient.text(c,"/mobile/v1/themes",512*1024));
        JSONArray packs=root.optJSONArray("packs");int installed=0;
        if(packs!=null)for(int i=0;i<packs.length();i++){
            JSONObject p=packs.optJSONObject(i);if(p==null)continue;String id=p.optString("id","").trim();if(id.isEmpty())continue;
            byte[] zip=BridgeBinaryClient.get(c,"/mobile/v1/themes/"+URLEncoder.encode(id,"UTF-8").replace("+","%20"),24*1024*1024);
            ThemePackStore.install(c,zip);installed++;
        }
        // Deliberately ignore Desktop activeThemeId. Theme packs are shared,
        // but Desktop and Android each own their local active-theme selection.
        if(!activeBefore.isEmpty()){
            try{ThemePackStore.activate(c,activeBefore);}catch(Exception ignored){}
        }
        Ui.applyTheme(c);return installed;
    }
}
