package com.picalibrary.android;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** Pica credentials/session encrypted with Android Keystore. */
final class PicaAccountStore {
    static final class Session {
        final String account,password,token;
        Session(String account,String password,String token){this.account=account;this.password=password;this.token=token;}
        boolean configured(){return !account.isEmpty()&&(!password.isEmpty()||!token.isEmpty());}
        boolean signedIn(){return !token.isEmpty();}
    }
    private static final String PREF="pica-account-v1";
    private static final String ALIAS="picalibrary.pica.session.v1";
    private PicaAccountStore(){}

    static Session load(Context context){SharedPreferences p=context.getSharedPreferences(PREF,Context.MODE_PRIVATE);return new Session(decrypt(p.getString("account","")),decrypt(p.getString("password","")),decrypt(p.getString("token","")));}
    static void saveCredentials(Context context,String account,String password) throws Exception {Session old=load(context);context.getSharedPreferences(PREF,Context.MODE_PRIVATE).edit().putString("account",encrypt(account==null?"":account.trim())).putString("password",encrypt(password==null||password.isEmpty()?old.password:password)).apply();}
    static void saveSession(Context context,String account,String password,String token) throws Exception {context.getSharedPreferences(PREF,Context.MODE_PRIVATE).edit().putString("account",encrypt(account==null?"":account.trim())).putString("password",encrypt(password==null?"":password)).putString("token",encrypt(token==null?"":token)).apply();}
    static void saveToken(Context context,String token) throws Exception {context.getSharedPreferences(PREF,Context.MODE_PRIVATE).edit().putString("token",encrypt(token==null?"":token)).apply();}
    static void clearToken(Context context){context.getSharedPreferences(PREF,Context.MODE_PRIVATE).edit().remove("token").apply();}
    static void clear(Context context){context.getSharedPreferences(PREF,Context.MODE_PRIVATE).edit().clear().apply();}

    private static SecretKey key() throws Exception {KeyStore store=KeyStore.getInstance("AndroidKeyStore");store.load(null);KeyStore.Entry entry=store.getEntry(ALIAS,null);if(entry instanceof KeyStore.SecretKeyEntry)return ((KeyStore.SecretKeyEntry)entry).getSecretKey();KeyGenerator generator=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore");generator.init(new KeyGenParameterSpec.Builder(ALIAS,KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).setKeySize(256).build());return generator.generateKey();}
    private static String encrypt(String value) throws Exception {Cipher c=Cipher.getInstance("AES/GCM/NoPadding");c.init(Cipher.ENCRYPT_MODE,key());byte[] data=c.doFinal(value.getBytes(StandardCharsets.UTF_8));return Base64.encodeToString(c.getIV(),Base64.NO_WRAP)+":"+Base64.encodeToString(data,Base64.NO_WRAP);}
    private static String decrypt(String value){if(value==null||value.isEmpty())return "";try{String[] parts=value.split(":",2);if(parts.length!=2)return "";Cipher c=Cipher.getInstance("AES/GCM/NoPadding");c.init(Cipher.DECRYPT_MODE,key(),new GCMParameterSpec(128,Base64.decode(parts[0],Base64.NO_WRAP)));return new String(c.doFinal(Base64.decode(parts[1],Base64.NO_WRAP)),StandardCharsets.UTF_8);}catch(Exception e){return "";}}
}
