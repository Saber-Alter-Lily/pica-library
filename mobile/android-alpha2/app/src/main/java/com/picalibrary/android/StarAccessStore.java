package com.picalibrary.android;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Handler;
import android.os.Looper;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
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

    private static final class CheckResult {
        final boolean found;
        final int status;
        CheckResult(boolean found,int status){this.found=found;this.status=status;}
    }

    private static HttpURLConnection openApi(String address)throws Exception{
        HttpURLConnection c=(HttpURLConnection)new URL(address).openConnection();
        c.setConnectTimeout(12000);c.setReadTimeout(12000);c.setRequestMethod("GET");
        c.setRequestProperty("Accept","application/vnd.github+json");
        c.setRequestProperty("X-GitHub-Api-Version","2022-11-28");
        c.setRequestProperty("User-Agent","Pica-Library-Android");
        return c;
    }

    private static JSONArray readArray(HttpURLConnection c)throws Exception{
        StringBuilder body=new StringBuilder();
        try(BufferedReader reader=new BufferedReader(new InputStreamReader(c.getInputStream(),StandardCharsets.UTF_8))){
            String line;while((line=reader.readLine())!=null)body.append(line);
        }
        return new JSONArray(body.toString());
    }

    /** Primary route: scan the public repository stargazer list. */
    private static CheckResult checkRepositoryStargazers(String username)throws Exception{
        for(int page=1;page<=100;page++){
            HttpURLConnection c=null;
            try{
                c=openApi("https://api.github.com/repos/"+REPOSITORY+"/stargazers?per_page=100&page="+page);
                int code=c.getResponseCode();
                if(code!=200)return new CheckResult(false,code);
                JSONArray users=readArray(c);
                for(int i=0;i<users.length();i++){
                    JSONObject item=users.optJSONObject(i);
                    if(item!=null&&username.equalsIgnoreCase(item.optString("login","")))return new CheckResult(true,200);
                }
                if(users.length()<100)return new CheckResult(false,200);
            }finally{if(c!=null)c.disconnect();}
        }
        return new CheckResult(false,200);
    }

    /** Secondary route: scan the public repositories starred by the named user. */
    private static CheckResult checkUserStars(String username)throws Exception{
        String encoded=URLEncoder.encode(username,"UTF-8").replace("+","%20");
        for(int page=1;page<=100;page++){
            HttpURLConnection c=null;
            try{
                c=openApi("https://api.github.com/users/"+encoded+"/starred?per_page=100&page="+page);
                int code=c.getResponseCode();
                if(code!=200)return new CheckResult(false,code);
                JSONArray repos=readArray(c);
                for(int i=0;i<repos.length();i++){
                    JSONObject item=repos.optJSONObject(i);
                    if(item!=null&&REPOSITORY.equalsIgnoreCase(item.optString("full_name","")))return new CheckResult(true,200);
                }
                if(repos.length()<100)return new CheckResult(false,200);
            }finally{if(c!=null)c.disconnect();}
        }
        return new CheckResult(false,200);
    }

    interface Callback{void done(boolean unlocked,String message);}
    static void verify(Context c,String username,Callback callback){
        final Context app=c.getApplicationContext();
        final String user=String.valueOf(username==null?"":username).trim();
        if(!user.matches("[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?")){
            callback.done(false,"请输入有效的 GitHub 用户名");return;
        }
        new Thread(()->{
            boolean ok=false;
            String message="没有检测到该账号对 Pica Library 的 Star";
            try{
                CheckResult primary=checkRepositoryStargazers(user);
                ok=primary.found;
                CheckResult secondary=null;
                if(!ok)secondary=checkUserStars(user);
                if(!ok&&secondary!=null)ok=secondary.found;

                if(ok){
                    String at=java.time.Instant.now().toString();
                    prefs(app).edit().putString("github_user",user).putString("verified_at",at).apply();
                    message="已验证 GitHub Star，个性化装扮已解锁";
                }else{
                    int secondaryStatus=secondary==null?200:secondary.status;
                    if(primary.status==403||primary.status==429||secondaryStatus==403||secondaryStatus==429)
                        message="GitHub 暂时限制了验证请求，请稍后重试";
                    else if(primary.status==401&&secondaryStatus==401)
                        message="GitHub 公开 Star 验证连续返回 HTTP 401，请检查网络或代理后重试";
                    else if(primary.status!=200&&secondaryStatus!=200)
                        message="GitHub Star 验证失败（HTTP "+primary.status+" / "+secondaryStatus+"）";
                    else if(secondaryStatus==404)
                        message="没有找到该 GitHub 用户";
                }
            }catch(Exception e){message="无法连接 GitHub 验证 Star："+e.getMessage();}
            final boolean result=ok;final String text=message;
            new Handler(Looper.getMainLooper()).post(()->callback.done(result,text));
        },"pica-star-verify").start();
    }
}
