package com.picalibrary.android;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Handler;
import android.os.Looper;
import java.net.HttpURLConnection;
import java.net.URL;
import org.json.JSONArray;
import org.json.JSONObject;

/** Lightweight community gate for official builds. A successful Star check is remembered locally. */
final class StarAccessStore {
    static final String REPOSITORY="Saber-Alter-Lily/pica-library";
    static final String REPOSITORY_URL="https://github.com/"+REPOSITORY;
    private static final String PREFS="pica_star_access_v1";
    private StarAccessStore(){}

    private static SharedPreferences prefs(Context c){return c.getSharedPreferences(PREFS,Context.MODE_PRIVATE);}
    static boolean enabled(Context c){return OfficialBuildGate.isOfficial(c)&&!user(c).isEmpty();}
    static String user(Context c){return prefs(c).getString("github_user","").trim();}
    static String verifiedAt(Context c){return prefs(c).getString("verified_at","").trim();}
    static JSONObject status(Context c){
        JSONObject o=new JSONObject();
        try{o.put("unlocked",enabled(c));o.put("githubUser",user(c));o.put("verifiedAt",verifiedAt(c));}catch(Exception ignored){}
        return o;
    }
    static void installSyncedProof(Context c,JSONObject value){
        if(value==null||!value.optBoolean("unlocked",false))return;
        String username=value.optString("githubUser","").trim();
        if(username.isEmpty())return;
        String at=value.optString("verifiedAt","").trim();
        prefs(c).edit().putString("github_user",username).putString("verified_at",at.isEmpty()?String.valueOf(System.currentTimeMillis()):at).apply();
    }
    interface Callback{void done(boolean unlocked,String message);}
    static void verify(Context c,String username,Callback callback){
        final Context app=c.getApplicationContext();
        final String user=String.valueOf(username==null?"":username).trim();
        if(!user.matches("[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?")){
            callback.done(false,"请输入有效的 GitHub 用户名");return;
        }
        new Thread(()->{
            boolean ok=false;String message="没有检测到该账号对 Pica Library 的 Star";
            HttpURLConnection connection=null;
            try{
                for(int page=1;page<=100&&!ok;page++){
                    URL url=new URL("https://api.github.com/repos/"+REPOSITORY+"/stargazers?per_page=100&page="+page);
                    connection=(HttpURLConnection)url.openConnection();
                    connection.setConnectTimeout(12000);connection.setReadTimeout(12000);connection.setRequestMethod("GET");
                    connection.setRequestProperty("Accept","application/vnd.github+json");
                    connection.setRequestProperty("X-GitHub-Api-Version","2022-11-28");
                    connection.setRequestProperty("User-Agent","Pica-Library-Android");
                    int code=connection.getResponseCode();
                    if(code==403||code==429){message="GitHub 暂时限制了验证请求，请稍后重试";break;}
                    if(code!=200){message="GitHub Star 验证失败（HTTP "+code+"）";break;}
                    StringBuilder body=new StringBuilder();
                    try(java.io.BufferedReader reader=new java.io.BufferedReader(new java.io.InputStreamReader(connection.getInputStream(),java.nio.charset.StandardCharsets.UTF_8))){String line;while((line=reader.readLine())!=null)body.append(line);}
                    JSONArray users=new JSONArray(body.toString());
                    for(int i=0;i<users.length();i++){JSONObject item=users.optJSONObject(i);if(item!=null&&user.equalsIgnoreCase(item.optString("login",""))){ok=true;break;}}
                    connection.disconnect();connection=null;
                    if(ok){String at=java.time.Instant.now().toString();prefs(app).edit().putString("github_user",user).putString("verified_at",at).apply();message="已验证 GitHub Star，个性化装扮已解锁";break;}
                    if(users.length()<100)break;
                }
            }catch(Exception e){message="无法连接 GitHub 验证 Star："+e.getMessage();}
            finally{if(connection!=null)connection.disconnect();}
            final boolean result=ok;final String text=message;
            new Handler(Looper.getMainLooper()).post(()->callback.done(result,text));
        },"pica-star-verify").start();
    }
}
