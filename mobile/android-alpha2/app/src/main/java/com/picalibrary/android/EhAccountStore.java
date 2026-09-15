package com.picalibrary.android;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.Locale;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** E-H identity/session cookies encrypted with Android Keystore. Passwords are never stored here. */
final class EhAccountStore {
    static final class Session {
        final String memberId,passHash,igneous,cfClearance;
        Session(String memberId,String passHash,String igneous,String cfClearance){this.memberId=memberId;this.passHash=passHash;this.igneous=igneous;this.cfClearance=cfClearance;}
        boolean configured(){return !memberId.isEmpty()&&!passHash.isEmpty();}
    }
    private static final String PREF="eh-account-v1";
    private static final String ALIAS="picalibrary.eh.session.v1";
    private static final String COOKIE_FORUMS="cookie.forums";
    private static final String COOKIE_EH="cookie.eh";
    private static final String COOKIE_EXH="cookie.exh";
    private EhAccountStore(){}

    static Session load(Context context){SharedPreferences p=context.getSharedPreferences(PREF,Context.MODE_PRIVATE);return new Session(decrypt(p.getString("memberId","")),decrypt(p.getString("passHash","")),decrypt(p.getString("igneous","")),decrypt(p.getString("cfClearance","")));}
    static void save(Context context,Session value) throws Exception {context.getSharedPreferences(PREF,Context.MODE_PRIVATE).edit().putString("memberId",encrypt(value.memberId)).putString("passHash",encrypt(value.passHash)).putString("igneous",encrypt(value.igneous)).putString("cfClearance",encrypt(value.cfClearance)).apply();EhCapabilityStore.invalidate(context);}

    static void saveCookieJars(Context context,String forums,String eh,String exh) throws Exception {
        context.getSharedPreferences(PREF,Context.MODE_PRIVATE).edit()
            .putString(COOKIE_FORUMS,encrypt(cleanCookieHeader(forums)))
            .putString(COOKIE_EH,encrypt(cleanCookieHeader(eh)))
            .putString(COOKIE_EXH,encrypt(cleanCookieHeader(exh)))
            .apply();
        EhCapabilityStore.invalidate(context);
    }
    static String cookieJar(Context context,String host){
        String key=cookieKey(host);if(key.isEmpty())return "";
        return decrypt(context.getSharedPreferences(PREF,Context.MODE_PRIVATE).getString(key,""));
    }
    static void saveCookieJar(Context context,String host,String raw) throws Exception {
        String key=cookieKey(host);if(key.isEmpty())return;
        context.getSharedPreferences(PREF,Context.MODE_PRIVATE).edit().putString(key,encrypt(cleanCookieHeader(raw))).apply();
    }
    static void clearCookieJars(Context context){context.getSharedPreferences(PREF,Context.MODE_PRIVATE).edit().remove(COOKIE_FORUMS).remove(COOKIE_EH).remove(COOKIE_EXH).apply();EhCapabilityStore.invalidate(context);}
    static void clear(Context context){context.getSharedPreferences(PREF,Context.MODE_PRIVATE).edit().clear().apply();EhCapabilityStore.clear(context);}

    private static String cookieKey(String host){String h=host==null?"":host.toLowerCase(Locale.ROOT);if(h.equals("forums.e-hentai.org")||h.endsWith(".forums.e-hentai.org"))return COOKIE_FORUMS;if(h.equals("e-hentai.org")||h.endsWith(".e-hentai.org"))return COOKIE_EH;if(h.equals("exhentai.org")||h.endsWith(".exhentai.org"))return COOKIE_EXH;return "";}
    private static String cleanCookieHeader(String raw){if(raw==null||raw.trim().isEmpty())return "";StringBuilder out=new StringBuilder();for(String part:raw.split(";")){String item=part.trim();int at=item.indexOf('=');if(at<=0)continue;String name=item.substring(0,at).trim(),value=item.substring(at+1).trim();if(name.isEmpty()||value.isEmpty()||containsCtl(name)||containsCtl(value))continue;if(out.length()>0)out.append("; ");out.append(name).append('=').append(value);}return out.toString();}
    private static boolean containsCtl(String value){for(int i=0;i<value.length();i++){char c=value.charAt(i);if(c<0x20||c==0x7f)return true;}return false;}

    private static SecretKey key() throws Exception {KeyStore store=KeyStore.getInstance("AndroidKeyStore");store.load(null);KeyStore.Entry entry=store.getEntry(ALIAS,null);if(entry instanceof KeyStore.SecretKeyEntry)return ((KeyStore.SecretKeyEntry)entry).getSecretKey();KeyGenerator generator=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore");generator.init(new KeyGenParameterSpec.Builder(ALIAS,KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).setKeySize(256).build());return generator.generateKey();}
    private static String encrypt(String value) throws Exception {Cipher c=Cipher.getInstance("AES/GCM/NoPadding");c.init(Cipher.ENCRYPT_MODE,key());byte[] data=c.doFinal((value==null?"":value).getBytes(StandardCharsets.UTF_8));return Base64.encodeToString(c.getIV(),Base64.NO_WRAP)+":"+Base64.encodeToString(data,Base64.NO_WRAP);}
    private static String decrypt(String value){if(value==null||value.isEmpty())return "";try{String[] parts=value.split(":",2);if(parts.length!=2)return "";Cipher c=Cipher.getInstance("AES/GCM/NoPadding");c.init(Cipher.DECRYPT_MODE,key(),new GCMParameterSpec(128,Base64.decode(parts[0],Base64.NO_WRAP)));return new String(c.doFinal(Base64.decode(parts[1],Base64.NO_WRAP)),StandardCharsets.UTF_8);}catch(Exception e){return "";}}
}
