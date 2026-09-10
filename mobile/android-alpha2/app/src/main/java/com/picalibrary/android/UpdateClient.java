package com.picalibrary.android;

import android.content.Context;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import java.io.*;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import org.json.JSONObject;

final class UpdateClient {
    static final String MANIFEST_URL="https://github.com/Saber-Alter-Lily/pica-library/releases/download/android-preview/android-update.json";
    static final class Info {
        final int versionCode,minVersionCode;final String versionName,apkUrl,sha256,notes;
        Info(int versionCode,String versionName,String apkUrl,String sha256,String notes,int minVersionCode){this.versionCode=versionCode;this.versionName=versionName;this.apkUrl=apkUrl;this.sha256=sha256;this.notes=notes;this.minVersionCode=minVersionCode;}
    }
    private UpdateClient(){}
    static Info check(Context context) throws Exception {
        String text=getText(MANIFEST_URL,2*1024*1024);JSONObject o=new JSONObject(text);return new Info(o.getInt("versionCode"),o.getString("versionName"),o.getString("apkUrl"),o.getString("sha256").toLowerCase(Locale.ROOT),o.optString("releaseNotes",""),o.optInt("minimumSupportedVersionCode",1));
    }
    static int currentVersionCode(Context context){try{return (int)context.getPackageManager().getPackageInfo(context.getPackageName(),0).getLongVersionCode();}catch(Exception e){return 0;}}
    static boolean newer(Context context,Info info){return info.versionCode>currentVersionCode(context);}
    static boolean verify(File file,String expected) throws Exception {MessageDigest digest=MessageDigest.getInstance("SHA-256");try(InputStream in=new FileInputStream(file)){byte[] b=new byte[32768];int n;while((n=in.read(b))>0)digest.update(b,0,n);}StringBuilder out=new StringBuilder();for(byte b:digest.digest())out.append(String.format(Locale.ROOT,"%02x",b));return out.toString().equalsIgnoreCase(expected);}
    static void verifyPackage(Context context,File file,int expectedVersionCode) throws Exception {
        PackageManager pm=context.getPackageManager();PackageInfo archive=pm.getPackageArchiveInfo(file.getAbsolutePath(),PackageManager.GET_SIGNING_CERTIFICATES);if(archive==null)throw new SecurityException("无法解析更新 APK");if(!context.getPackageName().equals(archive.packageName))throw new SecurityException("更新包包名不匹配");if(expectedVersionCode>0&&archive.getLongVersionCode()!=expectedVersionCode)throw new SecurityException("更新包版本号与清单不匹配");PackageInfo installed=pm.getPackageInfo(context.getPackageName(),PackageManager.GET_SIGNING_CERTIFICATES);Set<String> installedCerts=signerDigests(installed);Set<String> archiveCerts=signerDigests(archive);if(installedCerts.isEmpty()||archiveCerts.isEmpty())throw new SecurityException("无法读取 APK 签名证书");boolean overlap=false;for(String value:archiveCerts)if(installedCerts.contains(value)){overlap=true;break;}if(!overlap)throw new SecurityException("更新包签名与当前安装版本不一致");
    }
    private static Set<String> signerDigests(PackageInfo info) throws Exception {Set<String> out=new HashSet<>();if(info==null||info.signingInfo==null)return out;Signature[] signatures=info.signingInfo.hasMultipleSigners()?info.signingInfo.getApkContentsSigners():info.signingInfo.getSigningCertificateHistory();if(signatures==null)return out;for(Signature signature:signatures){MessageDigest digest=MessageDigest.getInstance("SHA-256");byte[] bytes=digest.digest(signature.toByteArray());StringBuilder value=new StringBuilder();for(byte b:bytes)value.append(String.format(Locale.ROOT,"%02x",b));out.add(value.toString());}return out;}
    private static String getText(String url,int limit) throws Exception {HttpURLConnection c=(HttpURLConnection)new URL(url).openConnection();c.setConnectTimeout(8000);c.setReadTimeout(15000);c.setInstanceFollowRedirects(true);c.setRequestProperty("Accept","application/json");c.setRequestProperty("User-Agent","Pica-Library-Android");int status=c.getResponseCode();if(status<200||status>=300)throw new IOException("更新服务 HTTP "+status);try(InputStream in=c.getInputStream();ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] b=new byte[8192];int n;while((n=in.read(b))>0){if(out.size()+n>limit)throw new IOException("更新清单过大");out.write(b,0,n);}return out.toString("UTF-8");}finally{c.disconnect();}}
}
