package com.picalibrary.android;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import java.io.*;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.*;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import org.json.*;

/** Android remote-storage registry. Legacy single-WebDAV settings remain readable until explicitly saved. */
final class RemoteConfigStore {
    static final class Config {
        final String id,label,vendor,baseUrl,root,username,password;
        Config(String id,String label,String vendor,String baseUrl,String root,String username,String password){
            this.id=id==null?"":id;this.label=label==null||label.trim().isEmpty()?"WebDAV":label.trim();this.vendor=vendor==null||vendor.trim().isEmpty()?"generic":vendor.trim();
            this.baseUrl=baseUrl==null?"":baseUrl;this.root=root==null||root.trim().isEmpty()?"PicaLibrary":root;this.username=username==null?"":username;this.password=password==null?"":password;
        }
        Config(String baseUrl,String root,String username,String password){this("","WebDAV",inferVendor(baseUrl),baseUrl,root,username,password);}
        boolean configured(){return baseUrl!=null&&!baseUrl.trim().isEmpty();}
    }
    static final class Preset {
        final String vendor,label,defaultBaseUrl,urlHint,usernameHint,passwordHint,note;
        Preset(String vendor,String label,String defaultBaseUrl,String urlHint,String usernameHint,String passwordHint,String note){
            this.vendor=vendor;this.label=label;this.defaultBaseUrl=defaultBaseUrl==null?"":defaultBaseUrl;this.urlHint=urlHint;this.usernameHint=usernameHint;this.passwordHint=passwordHint;this.note=note;
        }
    }

    private static final String PREF="remote-storage";
    private static final String ALIAS="picalibrary.remote.webdav.v1";
    private static final String REGISTRY="targets-v2";
    private static final String ACTIVE="activeTargetId-v2";
    private static final String LEGACY_ID="legacy-default";
    private static final List<Preset> PRESETS=Collections.unmodifiableList(Arrays.asList(
        new Preset("generic","通用 WebDAV","","https://dav.example.com/path","WebDAV 用户名","WebDAV 密码 / App Password","适用于标准 WebDAV 服务，建议使用 HTTPS。"),
        new Preset("123pan","123 云盘","https://webdav.123pan.cn/webdav","https://webdav.123pan.cn/webdav","123 云盘第三方挂载用户名","第三方挂载 App Password","自动使用 /webdav；123 云盘使用扁平对象兼容模式，避免 MKCOL 目录创建问题。"),
        new Preset("jianguoyun","坚果云","https://dav.jianguoyun.com/dav","https://dav.jianguoyun.com/dav","坚果云注册邮箱","第三方应用密码","请使用坚果云第三方应用密码，不要填写网页登录密码。"),
        new Preset("pcloud-us","pCloud · US","https://webdav.pcloud.com","https://webdav.pcloud.com","pCloud 邮箱","pCloud 密码","仅适用于 US 数据区。"),
        new Preset("pcloud-eu","pCloud · EU","https://ewebdav.pcloud.com","https://ewebdav.pcloud.com","pCloud 邮箱","pCloud 密码","仅适用于 EU 数据区，不要与 US endpoint 混用。"),
        new Preset("koofr","Koofr","https://app.koofr.net/dav/Koofr","https://app.koofr.net/dav/Koofr","Koofr 登录邮箱","Application password","Koofr WebDAV 必须使用 application-specific password。"),
        new Preset("yandex","Yandex Disk","https://webdav.yandex.ru","https://webdav.yandex.ru","Yandex username","WebDAV app password","WebDAV 可能受 Yandex 360 套餐限制。"),
        new Preset("infinicloud","InfiniCLOUD","","从 My Page 复制个人 WebDAV Connection URL","Connection ID","Apps Password","每个账号可能位于不同节点，请使用 My Page 显示的个人 URL。"),
        new Preset("nextcloud","Nextcloud","","https://server/nextcloud/remote.php/dav/files/USERNAME","Nextcloud 用户名","App password","优先复制 Nextcloud 设置页显示的 WebDAV URL，并使用 App Password。"),
        new Preset("owncloud","ownCloud","","https://server/owncloud/remote.php/webdav","ownCloud 用户名","密码 / App Password","URL 取决于部署版本和安装路径。"),
        new Preset("openlist","OpenList / AList","","https://server.example/dav/","OpenList/AList 用户名","OpenList/AList 密码","可把阿里云盘、Google Drive、OneDrive 等用户自建存储统一暴露为 WebDAV。"),
        new Preset("opendrive","OpenDrive","https://webdav.opendrive.com","https://webdav.opendrive.com","OpenDrive 用户名","OpenDrive 密码","OpenDrive WebDAV 取决于账户套餐。"),
        new Preset("synology","Synology WebDAV Server","","https://nas.example:5006","DSM 用户名","DSM 密码","请在 DSM WebDAV Server 中启用 HTTPS，端口以 NAS 实际设置为准。")
    ));

    private RemoteConfigStore(){}

    static List<Preset> presets(){return PRESETS;}
    static Preset preset(String vendor){for(Preset p:PRESETS)if(p.vendor.equals(vendor))return p;return PRESETS.get(0);}

    static String inferVendor(String value){
        try{
            URI uri=new URI(value==null?"":value.trim());String host=uri.getHost()==null?"":uri.getHost().toLowerCase(Locale.ROOT);
            if("webdav.123pan.cn".equals(host))return "123pan";
            if("dav.jianguoyun.com".equals(host))return "jianguoyun";
            if("webdav.pcloud.com".equals(host))return "pcloud-us";
            if("ewebdav.pcloud.com".equals(host))return "pcloud-eu";
            if("app.koofr.net".equals(host))return "koofr";
            if("webdav.yandex.ru".equals(host))return "yandex";
            if("webdav.opendrive.com".equals(host))return "opendrive";
            if(host.endsWith(".teracloud.jp")||host.endsWith(".infini-cloud.net"))return "infinicloud";
        }catch(Exception ignored){}
        return "generic";
    }

    static String normalizeBaseUrl(String value){
        String clean=value==null?"":value.trim().replaceAll("/+$","");
        if(clean.isEmpty())return "";
        try{
            URI uri=new URI(clean);String scheme=uri.getScheme()==null?"":uri.getScheme().toLowerCase(Locale.ROOT);
            if(!"https".equals(scheme)&&!"http".equals(scheme))throw new IllegalArgumentException("WebDAV 地址必须以 http:// 或 https:// 开头");
            String host=uri.getHost()==null?"":uri.getHost().toLowerCase(Locale.ROOT);String path=uri.getPath()==null?"":uri.getPath();boolean rootPath=path.isEmpty()||"/".equals(path);
            if("webdav.123pan.cn".equals(host)&&rootPath)path="/webdav";
            if("dav.jianguoyun.com".equals(host)&&rootPath)path="/dav";
            if("app.koofr.net".equals(host)&&rootPath)path="/dav/Koofr";
            URI safe=new URI(uri.getScheme(),null,uri.getHost(),uri.getPort(),path.isEmpty()?null:path,uri.getQuery(),null);
            return safe.toString().replaceAll("/+$","");
        }catch(IllegalArgumentException e){throw e;}
        catch(Exception e){throw new IllegalArgumentException("WebDAV 地址格式无效",e);}
    }

    static Config candidate(String baseUrl,String root,String username,String password,Config fallback){
        String id=fallback==null?"":fallback.id,label=fallback==null?"WebDAV":fallback.label,vendor=fallback==null?inferVendor(baseUrl):fallback.vendor;
        return candidate(id,label,vendor,baseUrl,root,username,password,fallback);
    }

    static Config candidate(String id,String label,String vendor,String baseUrl,String root,String username,String password,Config fallback){
        Preset preset=preset(vendor==null||vendor.trim().isEmpty()?"generic":vendor.trim());String raw=baseUrl==null?"":baseUrl.trim();if(raw.isEmpty())raw=preset.defaultBaseUrl;
        String clean=normalizeBaseUrl(raw);if(clean.isEmpty())throw new IllegalArgumentException("WebDAV 地址不能为空");
        String folder=(root==null?"PicaLibrary":root).trim().replace('\\','/').replaceAll("^/+|/+$","");if(folder.isEmpty())throw new IllegalArgumentException("根目录不能为空");
        String u=username==null||username.isEmpty()?(fallback==null?"":fallback.username):username;
        String p=password==null||password.isEmpty()?(fallback==null?"":fallback.password):password;
        String chosenVendor=vendor==null||vendor.trim().isEmpty()?inferVendor(clean):vendor.trim();if("generic".equals(chosenVendor))chosenVendor=inferVendor(clean);
        String chosenLabel=label==null||label.trim().isEmpty()?preset(chosenVendor).label:label.trim();if(chosenLabel.length()>80)throw new IllegalArgumentException("网盘名称过长");
        String chosenId=id==null?"":id.trim();if(!chosenId.isEmpty()&&!chosenId.matches("[a-zA-Z0-9_-]{1,96}"))throw new IllegalArgumentException("网盘配置 ID 无效");
        return new Config(chosenId,chosenLabel,chosenVendor,clean,folder,u,p);
    }

    static List<Config> targets(Context context){
        SharedPreferences p=context.getSharedPreferences(PREF,Context.MODE_PRIVATE);String raw=p.getString(REGISTRY,"");if(raw!=null&&!raw.isEmpty()){
            try{
                JSONObject root=new JSONObject(raw);JSONArray arr=root.optJSONArray("targets");ArrayList<Config> out=new ArrayList<>();if(arr!=null)for(int i=0;i<arr.length();i++){JSONObject o=arr.optJSONObject(i);if(o==null)continue;Config c=parseTarget(o);if(c.configured())out.add(c);}if(!out.isEmpty())return out;
            }catch(Exception ignored){}
        }
        Config legacy=legacy(p);if(legacy.configured())return Collections.singletonList(legacy);return Collections.emptyList();
    }

    static Config load(Context context){
        List<Config> list=targets(context);if(list.isEmpty())return new Config("","WebDAV","generic","","PicaLibrary","","");SharedPreferences p=context.getSharedPreferences(PREF,Context.MODE_PRIVATE);String active=p.getString(ACTIVE,"");for(Config c:list)if(c.id.equals(active))return c;return list.get(0);
    }
    static String activeTargetId(Context context){return load(context).id;}
    static Config find(Context context,String id){if(id==null)return null;for(Config c:targets(context))if(c.id.equals(id))return c;return null;}

    static void setActive(Context context,String id){
        Config target=find(context,id);if(target==null)throw new IllegalArgumentException("所选网盘配置不存在");SharedPreferences p=context.getSharedPreferences(PREF,Context.MODE_PRIVATE);String before=load(context).id;p.edit().putString(ACTIVE,target.id).apply();if(!target.id.equals(before))invalidateRemoteCache(context);
    }

    static Config saveTarget(Context context,String id,String label,String vendor,String baseUrl,String root,String username,String password) throws Exception {
        List<Config> current=new ArrayList<>(targets(context));Config fallback=null;String requested=id==null?"":id.trim();
        if(!requested.isEmpty())fallback=find(context,requested);
        if(requested.isEmpty()&&current.size()==1){fallback=current.get(0);requested=fallback.id;}
        if(requested.isEmpty())requested="remote-"+UUID.randomUUID().toString().replace("-","").substring(0,16);
        Config next=candidate(requested,label,vendor,baseUrl,root,username,password,fallback);boolean replaced=false;for(int i=0;i<current.size();i++)if(current.get(i).id.equals(next.id)){current.set(i,next);replaced=true;break;}if(!replaced)current.add(next);
        writeRegistry(context,current,next.id);if(LEGACY_ID.equals(next.id))writeLegacy(context,next);invalidateRemoteCache(context);return next;
    }

    /** Compatibility entrypoint for pre-multi-target callers: update the current/only target. */
    static void save(Context context,String baseUrl,String root,String username,String password) throws Exception {
        Config old=load(context);saveTarget(context,old.id,old.label,old.vendor,baseUrl,root,username,password);
    }

    static void deleteTarget(Context context,String id){
        List<Config> current=new ArrayList<>(targets(context));boolean removed=current.removeIf(c->c.id.equals(id));if(!removed)return;SharedPreferences p=context.getSharedPreferences(PREF,Context.MODE_PRIVATE);
        if(LEGACY_ID.equals(id))p.edit().remove("baseUrl").remove("root").remove("username").remove("password").apply();
        if(current.isEmpty()){p.edit().remove(REGISTRY).remove(ACTIVE).apply();invalidateRemoteCache(context);return;}
        String next=current.get(0).id;try{writeRegistry(context,current,next);}catch(Exception e){throw new IllegalStateException("无法删除网盘配置",e);}invalidateRemoteCache(context);
    }

    static void clear(Context context){context.getSharedPreferences(PREF,Context.MODE_PRIVATE).edit().clear().apply();invalidateRemoteCache(context);}

    private static Config legacy(SharedPreferences p){String stored=p.getString("baseUrl","");String base=normalizeBaseUrl(stored);return new Config(LEGACY_ID,"WebDAV",inferVendor(base),base,p.getString("root","PicaLibrary"),decrypt(p.getString("username","")),decrypt(p.getString("password","")));}
    private static Config parseTarget(JSONObject o){
        String base=normalizeBaseUrl(o.optString("baseUrl",""));String vendor=o.optString("vendor",inferVendor(base));return new Config(o.optString("id",""),o.optString("label",preset(vendor).label),vendor,base,o.optString("root","PicaLibrary"),decrypt(o.optString("username","")),decrypt(o.optString("password","")));
    }
    private static JSONObject json(Config c) throws Exception {JSONObject o=new JSONObject();o.put("id",c.id);o.put("label",c.label);o.put("vendor",c.vendor);o.put("baseUrl",c.baseUrl);o.put("root",c.root);o.put("username",encrypt(c.username));o.put("password",encrypt(c.password));return o;}
    private static void writeRegistry(Context context,List<Config> targets,String active) throws Exception {JSONArray arr=new JSONArray();for(Config c:targets)arr.put(json(c));JSONObject root=new JSONObject();root.put("schemaVersion",2);root.put("targets",arr);SharedPreferences.Editor e=context.getSharedPreferences(PREF,Context.MODE_PRIVATE).edit();e.putString(REGISTRY,root.toString());e.putString(ACTIVE,active);e.apply();}
    private static void writeLegacy(Context context,Config c) throws Exception {SharedPreferences.Editor e=context.getSharedPreferences(PREF,Context.MODE_PRIVATE).edit();e.putString("baseUrl",c.baseUrl);e.putString("root",c.root);e.putString("username",encrypt(c.username));e.putString("password",encrypt(c.password));e.apply();}

    /** The unified catalog stores availability for one active WebDAV target at a time. */
    private static void invalidateRemoteCache(Context context){
        File target=MobileStoragePaths.dataFile(context,"unified-catalog-v1.json");if(!target.isFile())return;
        try(InputStream in=new FileInputStream(target);ByteArrayOutputStream out=new ByteArrayOutputStream()){
            byte[] b=new byte[16384];int n;while((n=in.read(b))>0)out.write(b,0,n);JSONObject root=new JSONObject(out.toString("UTF-8"));root.put("remoteGeneration","");root.put("remoteUpdatedAt","");JSONArray entries=root.optJSONArray("entries");if(entries!=null)for(int i=0;i<entries.length();i++){JSONObject e=entries.optJSONObject(i);if(e==null)continue;e.put("remoteAvailable",false);e.put("remotePageCount",0);e.put("remoteEpisodeCount",0);e.put("remoteCoverPath","");e.put("remoteManifestPath","");}
            File tmp=new File(target.getParentFile(),target.getName()+".remote-switch.tmp");try(OutputStream output=new FileOutputStream(tmp)){output.write(root.toString().getBytes(StandardCharsets.UTF_8));}if(target.exists()&&!target.delete())throw new IOException("catalog replace failed");if(!tmp.renameTo(target))throw new IOException("catalog rename failed");
        }catch(Exception ignored){}
    }

    private static SecretKey key() throws Exception {
        KeyStore store=KeyStore.getInstance("AndroidKeyStore");store.load(null);KeyStore.Entry entry=store.getEntry(ALIAS,null);if(entry instanceof KeyStore.SecretKeyEntry)return ((KeyStore.SecretKeyEntry)entry).getSecretKey();
        KeyGenerator generator=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore");generator.init(new KeyGenParameterSpec.Builder(ALIAS,KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).setKeySize(256).build());return generator.generateKey();
    }
    private static String encrypt(String value) throws Exception {Cipher c=Cipher.getInstance("AES/GCM/NoPadding");c.init(Cipher.ENCRYPT_MODE,key());byte[] data=c.doFinal((value==null?"":value).getBytes(StandardCharsets.UTF_8));return Base64.encodeToString(c.getIV(),Base64.NO_WRAP)+":"+Base64.encodeToString(data,Base64.NO_WRAP);}
    private static String decrypt(String value){if(value==null||value.isEmpty())return "";try{String[] parts=value.split(":",2);if(parts.length!=2)return "";Cipher c=Cipher.getInstance("AES/GCM/NoPadding");c.init(Cipher.DECRYPT_MODE,key(),new GCMParameterSpec(128,Base64.decode(parts[0],Base64.NO_WRAP)));return new String(c.doFinal(Base64.decode(parts[1],Base64.NO_WRAP)),StandardCharsets.UTF_8);}catch(Exception e){return "";}}
}
