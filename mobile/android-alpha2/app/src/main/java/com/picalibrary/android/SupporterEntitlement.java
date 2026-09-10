package com.picalibrary.android;

import android.content.Context;
import android.util.Base64;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.PublicKey;
import java.security.Signature;
import java.security.spec.X509EncodedKeySpec;
import java.time.Instant;
import java.util.*;
import org.json.*;

/** Verifies supporter feature entitlements. The app contains only a public key and cannot mint valid grants. */
final class SupporterEntitlement {
    static final String FEATURE_THEME_PACKS="theme-packs";
    private static final String FILE="supporter-entitlement-v1.json";
    private static final String PUBLIC_KEY_DER_B64="MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEBXirGtMKpQHVTR0grXk5aRXajo0IYqiTfhkAS8FdkiQWlC7X4Tm/wgPRfFh/2QGJ/wDZva6kNUdgmO4b7WKuGg==";

    static final class Grant {
        final boolean valid;final String supporterId,issuedAt,expiresAt;final Set<String> features;
        Grant(boolean valid,String supporterId,String issuedAt,String expiresAt,Set<String> features){this.valid=valid;this.supporterId=supporterId;this.issuedAt=issuedAt;this.expiresAt=expiresAt;this.features=features;}
        boolean has(String feature){return valid&&features.contains(feature);}
    }

    private SupporterEntitlement(){}
    static File file(Context c){return new File(c.getFilesDir(),FILE);}
    static Grant load(Context c){File f=file(c);if(!f.isFile())return empty();try{return verify(new JSONObject(read(f)));}catch(Exception e){return empty();}}
    static boolean themePacksEnabled(Context c){return OfficialBuildGate.isOfficial(c)&&load(c).has(FEATURE_THEME_PACKS);}
    static void install(Context c,String json) throws Exception {if(!OfficialBuildGate.isOfficial(c))throw new SecurityException("仅官方签名版本可启用支持者功能");Grant grant=verify(new JSONObject(json));if(!grant.valid)throw new SecurityException("支持者凭证无效");File target=file(c),tmp=new File(c.getFilesDir(),FILE+".tmp");try(OutputStream out=new FileOutputStream(tmp)){out.write(json.getBytes(StandardCharsets.UTF_8));}if(target.exists()&&!target.delete())throw new IOException("无法替换支持者凭证");if(!tmp.renameTo(target))throw new IOException("无法保存支持者凭证");}
    static void clear(Context c){File f=file(c);if(f.exists())f.delete();}

    private static Grant verify(JSONObject o) throws Exception {
        if(o.optInt("schema",0)!=1)return empty();String supporterId=o.optString("supporterId","").trim(),issuedAt=o.optString("issuedAt","").trim(),expiresAt=o.optString("expiresAt","").trim(),nonce=o.optString("nonce","").trim(),signature=o.optString("signature","").trim();if(supporterId.isEmpty()||issuedAt.isEmpty()||nonce.isEmpty()||signature.isEmpty())return empty();
        JSONArray a=o.optJSONArray("features");List<String> features=new ArrayList<>();if(a!=null)for(int i=0;i<a.length();i++){String v=a.optString(i,"").trim();if(!v.isEmpty()&&!features.contains(v))features.add(v);}Collections.sort(features);
        Instant issued=Instant.parse(issuedAt);if(issued.isAfter(Instant.now().plusSeconds(86400)))return empty();if(!expiresAt.isEmpty()&&!Instant.parse(expiresAt).isAfter(Instant.now()))return empty();
        String canonical=canonical(supporterId,issuedAt,expiresAt,features,nonce);KeyFactory factory=KeyFactory.getInstance("EC");PublicKey key=factory.generatePublic(new X509EncodedKeySpec(Base64.decode(PUBLIC_KEY_DER_B64,Base64.DEFAULT)));Signature verifier=Signature.getInstance("SHA256withECDSA");verifier.initVerify(key);verifier.update(canonical.getBytes(StandardCharsets.UTF_8));boolean ok=verifier.verify(Base64.decode(signature,Base64.DEFAULT));return ok?new Grant(true,supporterId,issuedAt,expiresAt,new LinkedHashSet<>(features)):empty();
    }
    static String canonical(String supporterId,String issuedAt,String expiresAt,List<String> features,String nonce){return "1\n"+supporterId+"\n"+issuedAt+"\n"+(expiresAt==null?"":expiresAt)+"\n"+String.join(",",features)+"\n"+nonce;}
    private static Grant empty(){return new Grant(false,"","","",Collections.emptySet());}
    private static String read(File f) throws Exception {try(InputStream in=new FileInputStream(f);ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] b=new byte[4096];int n;while((n=in.read(b))>0)out.write(b,0,n);return out.toString("UTF-8");}}
}
