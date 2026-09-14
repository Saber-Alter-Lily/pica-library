package com.picalibrary.android;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

final class RemoteConfigStore {
    static final class Config {
        final String baseUrl, root, username, password;
        Config(String baseUrl,String root,String username,String password){this.baseUrl=baseUrl;this.root=root;this.username=username;this.password=password;}
        boolean configured(){return baseUrl!=null&&!baseUrl.trim().isEmpty();}
    }
    private static final String PREF="remote-storage";
    private static final String ALIAS="picalibrary.remote.webdav.v1";
    private RemoteConfigStore(){}

    static Config load(Context context){
        SharedPreferences p=context.getSharedPreferences(PREF,Context.MODE_PRIVATE);
        String stored=p.getString("baseUrl","");
        return new Config(normalizeBaseUrl(stored),p.getString("root","PicaLibrary"),decrypt(p.getString("username","")),decrypt(p.getString("password","")));
    }
    private static String normalizeBaseUrl(String value){
        String clean=value==null?"":value.trim().replaceAll("/+$","");
        if(clean.isEmpty())return "";
        try{
            URI uri=new URI(clean);
            String scheme=uri.getScheme()==null?"":uri.getScheme().toLowerCase(java.util.Locale.ROOT);
            if(!"https".equals(scheme)&&!"http".equals(scheme))throw new IllegalArgumentException("WebDAV 地址必须以 http:// 或 https:// 开头");
            String host=uri.getHost()==null?"":uri.getHost().toLowerCase(java.util.Locale.ROOT);
            String path=uri.getPath()==null?"":uri.getPath();
            if("webdav.123pan.cn".equals(host)&&(path.isEmpty()||"/".equals(path))){
                URI fixed=new URI(uri.getScheme(),null,uri.getHost(),uri.getPort(),"/webdav",null,null);
                return fixed.toString();
            }
            URI safe=new URI(uri.getScheme(),null,uri.getHost(),uri.getPort(),path.isEmpty()?null:path,uri.getQuery(),null);
            return safe.toString().replaceAll("/+$","");
        }catch(IllegalArgumentException e){throw e;}
        catch(Exception e){throw new IllegalArgumentException("WebDAV 地址格式无效",e);}
    }
    static Config candidate(String baseUrl,String root,String username,String password,Config fallback){
        String clean=normalizeBaseUrl(baseUrl);
        if(clean.isEmpty())throw new IllegalArgumentException("WebDAV 地址不能为空");
        String folder=(root==null?"PicaLibrary":root).trim().replace('\\','/').replaceAll("^/+|/+$","");
        if(folder.isEmpty())throw new IllegalArgumentException("根目录不能为空");
        String u=username==null||username.isEmpty()?(fallback==null?"":fallback.username):username;
        String p=password==null||password.isEmpty()?(fallback==null?"":fallback.password):password;
        return new Config(clean,folder,u,p);
    }
    static void save(Context context,String baseUrl,String root,String username,String password) throws Exception {
        Config old=load(context);Config next=candidate(baseUrl,root,username,password,old);
        SharedPreferences.Editor e=context.getSharedPreferences(PREF,Context.MODE_PRIVATE).edit();
        e.putString("baseUrl",next.baseUrl);e.putString("root",next.root);
        e.putString("username",encrypt(next.username));e.putString("password",encrypt(next.password));e.apply();
    }
    static void clear(Context context){context.getSharedPreferences(PREF,Context.MODE_PRIVATE).edit().clear().apply();}
    private static SecretKey key() throws Exception {
        KeyStore store=KeyStore.getInstance("AndroidKeyStore");store.load(null);
        KeyStore.Entry entry=store.getEntry(ALIAS,null);if(entry instanceof KeyStore.SecretKeyEntry)return ((KeyStore.SecretKeyEntry)entry).getSecretKey();
        KeyGenerator generator=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(ALIAS,KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).setKeySize(256).build());return generator.generateKey();
    }
    private static String encrypt(String value) throws Exception {Cipher c=Cipher.getInstance("AES/GCM/NoPadding");c.init(Cipher.ENCRYPT_MODE,key());byte[] data=c.doFinal(value.getBytes(StandardCharsets.UTF_8));return Base64.encodeToString(c.getIV(),Base64.NO_WRAP)+":"+Base64.encodeToString(data,Base64.NO_WRAP);}
    private static String decrypt(String value){
        if(value==null||value.isEmpty())return "";try{String[] parts=value.split(":",2);if(parts.length!=2)return "";Cipher c=Cipher.getInstance("AES/GCM/NoPadding");c.init(Cipher.DECRYPT_MODE,key(),new GCMParameterSpec(128,Base64.decode(parts[0],Base64.NO_WRAP)));return new String(c.doFinal(Base64.decode(parts[1],Base64.NO_WRAP)),StandardCharsets.UTF_8);}catch(Exception e){return "";}
    }
}
