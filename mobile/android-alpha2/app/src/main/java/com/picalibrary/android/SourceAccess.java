package com.picalibrary.android;

import android.content.Context;
import android.util.AtomicFile;
import com.picalibrary.android.sources.SourceAccessPolicy;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import org.json.*;

/** Installation-local adapter. No credentials or catalog are copied into this file. */
final class SourceAccess {
    private static final Map<String,SourceAccess> INSTANCES=new HashMap<>();
    private final AtomicFile file;
    private final Context context;
    final SourceAccessPolicy policy;
    private String loadError="";
    private SourceAccess(Context context){
        this.context=context;
        file=new AtomicFile(new File(context.getFilesDir(),"source-access-v1.json"));
        SourceAccessPolicy.Snapshot initial=new SourceAccessPolicy.Snapshot(0,Collections.emptySet());
        try{
            if(file.getBaseFile().exists()||new File(file.getBaseFile()+".bak").exists())initial=parse(readBounded());
            else{
                // Presence only, never decode account secrets. Run before new-install disclaimer acceptance.
                boolean legacy=context.getSharedPreferences("pica-disclaimer-v1",0).contains("accepted_version")
                        ||context.getSharedPreferences("pica-account-v1",0).contains("account")
                        ||context.getSharedPreferences("eh-account-v1",0).contains("memberId")
                        ||context.getSharedPreferences("jm-account-v1",0).contains("credentials");
                initial=new SourceAccessPolicy.Snapshot(0,legacy?SourceAccessPolicy.IDS:Collections.emptySet());
                write(initial);
            }
        }catch(Exception error){loadError="SOURCE_POLICY_STORAGE_ERROR";initial=new SourceAccessPolicy.Snapshot(0,Collections.emptySet());}
        policy=new SourceAccessPolicy(initial);
    }
    static synchronized SourceAccess get(Context context){Context app=context.getApplicationContext();String key=app.getFilesDir().getAbsolutePath();SourceAccess value=INSTANCES.get(key);if(value==null){value=new SourceAccess(app);INSTANCES.put(key,value);}return value;}
    static synchronized void resetForTests(){INSTANCES.clear();}
    static boolean enabled(Context context,String id){return get(context).loadError.isEmpty()&&get(context).policy.enabled(id);}
    static SourceAccessPolicy.Permit bind(Context context,String id){return get(context).policy.bind(id);}
    static void require(Context context,String id){if(!enabled(context,id))throw new SourceAccessPolicy.Disabled(id);}
    static <T>T commit(SourceAccessPolicy.Access permit,SourceAccessPolicy.Commit<T> action){
        try{return permit==null?action.run():permit.commit(action);}
        catch(RuntimeException error){throw error;}catch(Exception error){throw new IllegalStateException(error);}
    }
    static String relaySource(String path){
        if(path!=null&&path.startsWith("/mobile/v1/provider/pica/"))return "pica";
        if(path!=null&&path.startsWith("/mobile/v1/provider/eh/"))return "eh";
        return ""; // LAN library, pairing, sync and WebDAV are not online provider requests.
    }
    SourceAccessPolicy.Snapshot snapshot(){return policy.snapshot();}
    String loadError(){return loadError;}
    synchronized SourceAccessPolicy.Snapshot save(long revision,Collection<String> choices) throws IOException {
        if(!loadError.isEmpty())throw new IOException(loadError); // retain damaged file; no silent repair/default opt-in
        SourceAccessPolicy.Snapshot before=policy.snapshot(),next=policy.save(revision,choices,this::write);
        for(String id:before.enabled)if(!next.enabled.contains(id))SourceTasks.pause(context,id);
        return next;
    }
    private byte[] readBounded() throws IOException {
        try(InputStream in=file.openRead();ByteArrayOutputStream out=new ByteArrayOutputStream()){
            byte[] buffer=new byte[1024];int count;while((count=in.read(buffer))!=-1){if(out.size()+count>4096)throw new IOException("Source policy is too large");out.write(buffer,0,count);}return out.toByteArray();
        }
    }
    private void write(SourceAccessPolicy.Snapshot value) throws IOException {
        FileOutputStream output=null;
        try{JSONObject json=new JSONObject();json.put("schemaVersion",1);json.put("revision",value.revision);json.put("enabled",new JSONArray(value.enabled));byte[] bytes=json.toString().getBytes(StandardCharsets.UTF_8);output=file.startWrite();output.write(bytes);output.getFD().sync();file.finishWrite(output);if(!Arrays.equals(file.readFully(),bytes))throw new IOException("Source policy readback failed");}
        catch(Exception error){if(output!=null)file.failWrite(output);throw new IOException("SOURCE_POLICY_STORAGE_ERROR",error);}
    }
    static SourceAccessPolicy.Snapshot parse(byte[] bytes) throws Exception {
        if(bytes.length>4096)throw new IOException("Source policy is too large");JSONObject json=new JSONObject(new String(bytes,StandardCharsets.UTF_8));
        if(json.length()!=3||!(json.get("schemaVersion") instanceof Integer)||json.getInt("schemaVersion")!=1)throw new IOException("Invalid source policy schema");
        Object revision=json.get("revision");if(!(revision instanceof Integer)&&!(revision instanceof Long))throw new IOException("Invalid revision");
        JSONArray values=json.getJSONArray("enabled");List<String> ids=new ArrayList<>();for(int i=0;i<values.length();i++){Object id=values.get(i);if(!(id instanceof String))throw new IOException("Invalid source identity");ids.add((String)id);}
        return new SourceAccessPolicy.Snapshot(((Number)revision).longValue(),ids);
    }
}
