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

/** E-H identity cookies encrypted with Android Keystore. Passwords are never stored here. */
final class EhAccountStore {
    static final class Session {
        final String memberId,passHash,igneous,cfClearance;
        Session(String memberId,String passHash,String igneous,String cfClearance){this.memberId=memberId;this.passHash=passHash;this.igneous=igneous;this.cfClearance=cfClearance;}
        boolean configured(){return !memberId.isEmpty()&&!passHash.isEmpty();}
    }
    private static final String PREF="eh-account-v1";
    private static final String ALIAS="picalibrary.eh.session.v1";
    private EhAccountStore(){}

    static Session load(Context context){SharedPreferences p=context.getSharedPreferences(PREF,Context.MODE_PRIVATE);return new Session(decrypt(p.getString("memberId","")),decrypt(p.getString("passHash","")),decrypt(p.getString("igneous","")),decrypt(p.getString("cfClearance","")));}
    static void save(Context context,Session value) throws Exception {context.getSharedPreferences(PREF,Context.MODE_PRIVATE).edit().putString("memberId",encrypt(value.memberId)).putString("passHash",encrypt(value.passHash)).putString("igneous",encrypt(value.igneous)).putString("cfClearance",encrypt(value.cfClearance)).apply();}
    static void clear(Context context){context.getSharedPreferences(PREF,Context.MODE_PRIVATE).edit().clear().apply();}

    private static SecretKey key() throws Exception {KeyStore store=KeyStore.getInstance("AndroidKeyStore");store.load(null);KeyStore.Entry entry=store.getEntry(ALIAS,null);if(entry instanceof KeyStore.SecretKeyEntry)return ((KeyStore.SecretKeyEntry)entry).getSecretKey();KeyGenerator generator=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore");generator.init(new KeyGenParameterSpec.Builder(ALIAS,KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).setKeySize(256).build());return generator.generateKey();}
    private static String encrypt(String value) throws Exception {Cipher c=Cipher.getInstance("AES/GCM/NoPadding");c.init(Cipher.ENCRYPT_MODE,key());byte[] data=c.doFinal((value==null?"":value).getBytes(StandardCharsets.UTF_8));return Base64.encodeToString(c.getIV(),Base64.NO_WRAP)+":"+Base64.encodeToString(data,Base64.NO_WRAP);}
    private static String decrypt(String value){if(value==null||value.isEmpty())return "";try{String[] parts=value.split(":",2);if(parts.length!=2)return "";Cipher c=Cipher.getInstance("AES/GCM/NoPadding");c.init(Cipher.DECRYPT_MODE,key(),new GCMParameterSpec(128,Base64.decode(parts[0],Base64.NO_WRAP)));return new String(c.doFinal(Base64.decode(parts[1],Base64.NO_WRAP)),StandardCharsets.UTF_8);}catch(Exception e){return "";}}
}
