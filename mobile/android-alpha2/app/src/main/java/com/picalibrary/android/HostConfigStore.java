package com.picalibrary.android;

import android.content.Context;
import android.util.AtomicFile;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import org.json.*;

/** One user-chosen Host descriptor. It contains no password, cookie, token, catalog or default URL. */
final class HostConfigStore {
    static final class Config {
        final String id,label,endpoint,authMode;final long revision;final boolean enabled,allowLan;
        Config(String id,long revision,String label,String endpoint,String authMode,boolean enabled,boolean allowLan){this.id=id;this.revision=revision;this.label=label;this.endpoint=endpoint;this.authMode=authMode;this.enabled=enabled;this.allowLan=allowLan;}
        static Config empty(){return new Config("",0,"","","none",false,false);}
        boolean configured(){return !id.isEmpty();}
    }
    private final AtomicFile file;
    HostConfigStore(Context context){file=new AtomicFile(new File(context.getFilesDir(),"user-host-config-v1.json"));}
    Config load() throws Exception {
        if(!file.getBaseFile().exists()&&!new File(file.getBaseFile()+".bak").exists())return Config.empty();
        byte[] bytes;try(InputStream in=file.openRead();ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] buffer=new byte[1024];int n;while((n=in.read(buffer))!=-1){if(out.size()+n>8192)throw bad();out.write(buffer,0,n);}bytes=out.toByteArray();}
        JSONObject value=HostJson.object(bytes);
        if(value.length()!=8||!(value.get("schemaVersion") instanceof Integer)||value.getInt("schemaVersion")!=1||!(value.get("enabled") instanceof Boolean)||!(value.get("allowInsecureLan") instanceof Boolean))throw bad();
        String id=HostProtocol.text(value.get("id"),36),label=HostProtocol.text(value.get("label"),120),auth=HostProtocol.text(value.get("authMode"),5);Object revision=value.get("revision");
        if(!id.matches("[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")||!(revision instanceof Integer||revision instanceof Long)||((Number)revision).longValue()<0||((Number)revision).longValue()>9007199254740991L)throw bad();
        HostEndpoint endpoint=new HostEndpoint(HostProtocol.text(value.get("endpoint"),2048),value.getBoolean("allowInsecureLan"),auth);
        if(!endpoint.value.equals(value.getString("endpoint")))throw bad();
        return new Config(id,((Number)revision).longValue(),label,endpoint.value,auth,value.getBoolean("enabled"),value.getBoolean("allowInsecureLan"));
    }
    void write(Config value)throws Exception {
        JSONObject root=new JSONObject().put("schemaVersion",1).put("id",value.id).put("revision",value.revision).put("label",value.label).put("endpoint",value.endpoint).put("authMode",value.authMode).put("enabled",value.enabled).put("allowInsecureLan",value.allowLan);
        byte[] bytes=root.toString().getBytes(StandardCharsets.UTF_8);FileOutputStream out=null;
        try{out=file.startWrite();out.write(bytes);out.getFD().sync();file.finishWrite(out);out=null;if(!Arrays.equals(file.readFully(),bytes))throw bad();}
        catch(Exception error){if(out!=null)file.failWrite(out);throw bad();}
    }
    private static IOException bad(){return new IOException("SOURCE_HOST_STORAGE");}
}
