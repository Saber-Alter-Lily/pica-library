package com.picalibrary.android;

import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONObject;

/** Stores only account-authenticated GitHub Star proof. OAuth access tokens are never persisted. */
final class StarAccessStore {
    static final String REPOSITORY="Saber-Alter-Lily/pica-library";
    static final String REPOSITORY_URL="https://github.com/"+REPOSITORY;
    private static final String PREFS="pica_star_access_v2";
    private static final String AUTH_METHOD="github-account-device-flow";
    private StarAccessStore(){}

    private static SharedPreferences prefs(Context c){return c.getSharedPreferences(PREFS,Context.MODE_PRIVATE);}
    static boolean enabled(Context c){return OfficialBuildGate.isOfficial(c)&&userId(c)>0&&!user(c).isEmpty()&&AUTH_METHOD.equals(authMethod(c));}
    static String user(Context c){return prefs(c).getString("github_user","").trim();}
    static long userId(Context c){return prefs(c).getLong("github_user_id",0L);}
    static String verifiedAt(Context c){return prefs(c).getString("verified_at","").trim();}
    static String authMethod(Context c){return prefs(c).getString("auth_method","").trim();}

    static JSONObject status(Context c){
        JSONObject o=new JSONObject();
        try{
            o.put("schema",2);
            o.put("unlocked",enabled(c));
            o.put("githubUser",user(c));
            o.put("githubUserId",userId(c));
            o.put("verifiedAt",verifiedAt(c));
            o.put("authMethod",authMethod(c));
        }catch(Exception ignored){}
        return o;
    }

    static void installAuthenticatedProof(Context c,String username,long githubUserId){
        String user=String.valueOf(username==null?"":username).trim();
        if(user.isEmpty()||githubUserId<=0)throw new IllegalArgumentException("GitHub 账号身份信息无效");
        prefs(c).edit()
            .putString("github_user",user)
            .putLong("github_user_id",githubUserId)
            .putString("verified_at",java.time.Instant.now().toString())
            .putString("auth_method",AUTH_METHOD)
            .apply();
    }

    static void installSyncedProof(Context c,JSONObject value){
        if(value==null||!value.optBoolean("unlocked",false))return;
        String method=value.optString("authMethod","").trim();
        String username=value.optString("githubUser","").trim();
        long githubUserId=value.optLong("githubUserId",0L);
        if(!AUTH_METHOD.equals(method)||username.isEmpty()||githubUserId<=0)return;
        String at=value.optString("verifiedAt","").trim();
        prefs(c).edit()
            .putString("github_user",username)
            .putLong("github_user_id",githubUserId)
            .putString("verified_at",at.isEmpty()?java.time.Instant.now().toString():at)
            .putString("auth_method",AUTH_METHOD)
            .apply();
    }

    static void clear(Context c){prefs(c).edit().clear().apply();}
}
