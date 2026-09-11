package com.picalibrary.android;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

/** GitHub account authentication for Star access. Tokens are never persisted. */
final class GitHubAccountAuth {
    static final String CLIENT_ID="Iv23li2rIouPPVGgMoyI";
    private static final String REPOSITORY="Saber-Alter-Lily/pica-library";
    private static final String GITHUB_API_VERSION="2022-11-28";
    private GitHubAccountAuth(){}

    interface Callback {
        void code(String userCode,String verificationUri);
        void done(boolean ok,String message);
    }

    static boolean configured(){return !CLIENT_ID.trim().isEmpty();}

    static void start(Context context,Callback callback){
        Context app=context.getApplicationContext();
        if(!configured()){
            callback.done(false,"GitHub 账号认证尚未配置：请先为 Pica Library 注册 GitHub App");
            return;
        }
        new Thread(()->{
            try{
                JSONObject start=postForm("https://github.com/login/device/code","client_id="+enc(CLIENT_ID));
                String deviceCode=start.optString("device_code","").trim();
                String userCode=start.optString("user_code","").trim();
                String verificationUri=start.optString("verification_uri","").trim();
                int interval=Math.max(5,start.optInt("interval",5));
                long expiresAt=System.currentTimeMillis()+Math.max(60,start.optInt("expires_in",900))*1000L;
                if(deviceCode.isEmpty()||userCode.isEmpty()||!verificationUri.startsWith("https://github.com/"))throw new IOException("GitHub 登录启动响应不完整");
                main(()->callback.code(userCode,verificationUri));
                try{Intent browser=new Intent(Intent.ACTION_VIEW,Uri.parse(verificationUri));browser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);app.startActivity(browser);}catch(Exception ignored){}
                while(System.currentTimeMillis()<expiresAt){
                    Thread.sleep(interval*1000L);
                    JSONObject token=postForm("https://github.com/login/oauth/access_token","client_id="+enc(CLIENT_ID)+"&device_code="+enc(deviceCode)+"&grant_type="+enc("urn:ietf:params:oauth:grant-type:device_code"));
                    String error=token.optString("error","");
                    if("authorization_pending".equals(error))continue;
                    if("slow_down".equals(error)){interval+=5;continue;}
                    if("expired_token".equals(error))throw new IOException("GitHub 登录验证码已过期，请重新开始");
                    if("access_denied".equals(error))throw new IOException("GitHub 登录授权已取消");
                    if(!error.isEmpty())throw new IOException(token.optString("error_description",error));
                    String accessToken=token.optString("access_token","").trim();
                    if(accessToken.isEmpty())throw new IOException("GitHub 未返回访问令牌");
                    Verified identity=verify(accessToken);
                    StarAccessStore.installAuthenticatedProof(app,identity.login,identity.id);
                    main(()->callback.done(true,"已验证 GitHub 账号 "+identity.login+" 的 Star，个性化装扮已解锁"));
                    return;
                }
                throw new IOException("GitHub 登录验证码已过期，请重新开始");
            }catch(Exception e){
                String message=e.getMessage()==null?e.getClass().getSimpleName():e.getMessage();
                main(()->callback.done(false,"GitHub 账号验证失败："+message));
            }
        },"pica-github-account-auth").start();
    }

    private static final class Verified {final String login;final long id;Verified(String login,long id){this.login=login;this.id=id;}}

    private static Verified verify(String token)throws Exception{
        HttpURLConnection user=open("https://api.github.com/user",token);
        try{
            int code=user.getResponseCode();if(code!=200)throw new IOException("GitHub 账号身份读取失败（HTTP "+code+"）");
            JSONObject identity=new JSONObject(read(user));
            String login=identity.optString("login","").trim();long id=identity.optLong("id",0L);
            if(login.isEmpty()||id<=0)throw new IOException("GitHub 账号身份信息无效");
            HttpURLConnection star=open("https://api.github.com/user/starred/"+REPOSITORY,token);
            try{
                int starCode=star.getResponseCode();
                if(starCode==404)throw new IOException("已登录 GitHub 账号 "+login+"，但该账号尚未 Star Pica Library");
                if(starCode!=204)throw new IOException("GitHub Star 身份验证失败（HTTP "+starCode+"）");
            }finally{star.disconnect();}
            return new Verified(login,id);
        }finally{user.disconnect();}
    }

    private static HttpURLConnection open(String url,String token)throws Exception{
        HttpURLConnection c=(HttpURLConnection)new URL(url).openConnection();
        c.setConnectTimeout(15000);c.setReadTimeout(15000);c.setRequestMethod("GET");
        c.setRequestProperty("Accept","application/vnd.github+json");
        c.setRequestProperty("Authorization","Bearer "+token);
        c.setRequestProperty("X-GitHub-Api-Version",GITHUB_API_VERSION);
        c.setRequestProperty("User-Agent","Pica-Library-Android");
        return c;
    }

    private static JSONObject postForm(String url,String form)throws Exception{
        HttpURLConnection c=(HttpURLConnection)new URL(url).openConnection();
        c.setConnectTimeout(15000);c.setReadTimeout(15000);c.setRequestMethod("POST");c.setDoOutput(true);
        c.setRequestProperty("Accept","application/json");
        c.setRequestProperty("Content-Type","application/x-www-form-urlencoded");
        c.setRequestProperty("User-Agent","Pica-Library-Android");
        byte[] bytes=form.getBytes(StandardCharsets.UTF_8);c.setFixedLengthStreamingMode(bytes.length);
        try(OutputStream out=c.getOutputStream()){out.write(bytes);}
        int code=c.getResponseCode();String body=read(c);c.disconnect();
        if(code<200||code>=300)throw new IOException("GitHub 登录请求失败（HTTP "+code+"）");
        return new JSONObject(body);
    }

    private static String read(HttpURLConnection c)throws Exception{
        InputStream raw=c.getResponseCode()>=400?c.getErrorStream():c.getInputStream();
        if(raw==null)return "{}";StringBuilder out=new StringBuilder();
        try(BufferedReader r=new BufferedReader(new InputStreamReader(raw,StandardCharsets.UTF_8))){String line;while((line=r.readLine())!=null)out.append(line);}return out.toString();
    }
    private static String enc(String value)throws Exception{return URLEncoder.encode(value,"UTF-8");}
    private static void main(Runnable r){new Handler(Looper.getMainLooper()).post(r);}
}
