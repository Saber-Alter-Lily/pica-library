package com.picalibrary.android;

import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import org.json.JSONObject;

/** JM secrets stay on this device, protected by a distinct Android Keystore key. */
final class JmAccountStore {
    private static final String PREFS="jm-account-v1",ALIAS="picalibrary.jm.account.v1";
    private static volatile String ephemeralScope;
    private JmAccountStore(){}
    static String scope(Context c){return ephemeralScope!=null?ephemeralScope:c.getSharedPreferences(PREFS,Context.MODE_PRIVATE).getString("scope","anonymous");}
    static JSONObject load(Context c) throws Exception {
        String stored=c.getSharedPreferences(PREFS,Context.MODE_PRIVATE).getString("credentials","");if(stored.isEmpty())return new JSONObject();
        try{String[] parts=stored.split(":",2);Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.DECRYPT_MODE,key(),new GCMParameterSpec(128,Base64.decode(parts[0],Base64.NO_WRAP)));return new JSONObject(new String(cipher.doFinal(Base64.decode(parts[1],Base64.NO_WRAP)),StandardCharsets.UTF_8));}
        catch(Exception error){throw new IllegalStateException("JM 本机登录无法恢复，请清除后重新登录");}
    }
    static void save(Context c,String username,String password,String uid) throws Exception {
        JSONObject credentials=new JSONObject();credentials.put("username",username);credentials.put("password",password);
        Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.ENCRYPT_MODE,key());
        String encrypted=Base64.encodeToString(cipher.getIV(),Base64.NO_WRAP)+":"+Base64.encodeToString(cipher.doFinal(credentials.toString().getBytes(StandardCharsets.UTF_8)),Base64.NO_WRAP);
        c.getSharedPreferences(PREFS,Context.MODE_PRIVATE).edit().putString("credentials",encrypted).putString("scope",ReaderPolicy.hash("jm\n"+uid)).apply();
        ephemeralScope=null;
    }
    static void sessionScope(Context c,String uid){ephemeralScope=ReaderPolicy.hash("jm\n"+uid);}
    static void clear(Context c){ephemeralScope="anonymous";c.getSharedPreferences(PREFS,Context.MODE_PRIVATE).edit().clear().apply();}
    private static SecretKey key() throws Exception {
        KeyStore store=KeyStore.getInstance("AndroidKeyStore");store.load(null);KeyStore.Entry existing=store.getEntry(ALIAS,null);if(existing instanceof KeyStore.SecretKeyEntry)return ((KeyStore.SecretKeyEntry)existing).getSecretKey();
        KeyGenerator generator=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore");generator.init(new KeyGenParameterSpec.Builder(ALIAS,KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).setKeySize(256).build());return generator.generateKey();
    }
}
