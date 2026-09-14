package com.picalibrary.android;

import android.content.Context;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.*;
import org.json.*;

/** Lossless E-H provider semantics. Chinese translations are presentation-only and never stored as identity. */
final class EhSemanticStore {
    static final class Tag {
        final String namespace,value,canonical;
        Tag(String namespace,String value){this.namespace=norm(namespace);this.value=normValue(value);this.canonical=this.namespace.isEmpty()?this.value:this.namespace+":"+this.value;}
    }
    static final class Record {
        final String comicId;
        String rawCategory="",updatedAt="";
        final List<Tag> rawTags=new ArrayList<>();
        final LinkedHashSet<String> surfaceBindings=new LinkedHashSet<>();
        Record(String comicId){this.comicId=comicId;}
    }
    static final class Snapshot {
        String updatedAt="";
        final LinkedHashMap<String,Record> byComicId=new LinkedHashMap<>();
    }

    private EhSemanticStore(){}
    private static File file(Context context){return MobileStoragePaths.dataFile(context,"eh-semantics-v1.json");}

    static Snapshot load(Context context){
        Snapshot snapshot=new Snapshot();File source=file(context);if(!source.isFile())return snapshot;
        try(InputStream in=new FileInputStream(source);ByteArrayOutputStream out=new ByteArrayOutputStream()){
            byte[] b=new byte[16384];int n;while((n=in.read(b))>0)out.write(b,0,n);
            JSONObject root=new JSONObject(out.toString("UTF-8"));snapshot.updatedAt=root.optString("updatedAt","");JSONArray rows=root.optJSONArray("records");
            if(rows!=null)for(int i=0;i<rows.length();i++){JSONObject o=rows.optJSONObject(i);if(o==null)continue;String id=o.optString("comicId","");if(!EhClient.isEhId(id))continue;Record r=new Record(id);r.rawCategory=o.optString("rawCategory","");r.updatedAt=o.optString("updatedAt","");JSONArray surfaces=o.optJSONArray("surfaceBindings");if(surfaces!=null)for(int j=0;j<surfaces.length();j++){String value=surfaces.optString(j,"").trim().toLowerCase(Locale.ROOT);if("eh".equals(value)||"exh".equals(value))r.surfaceBindings.add(value);}JSONArray tags=o.optJSONArray("rawTags");if(tags!=null)for(int j=0;j<tags.length();j++){JSONObject t=tags.optJSONObject(j);if(t==null)continue;Tag tag=new Tag(t.optString("namespace",""),t.optString("value",""));if(!tag.value.isEmpty())addUnique(r.rawTags,tag);}snapshot.byComicId.put(id,r);}
        }catch(Exception ignored){}
        return snapshot;
    }

    static synchronized void merge(Context context,EhClient.Comic comic){if(comic==null||!EhClient.isEhId(comic.id))return;Snapshot snapshot=load(context);apply(snapshot,comic);save(context,snapshot);}
    static synchronized void mergeAll(Context context,List<EhClient.Comic> comics){if(comics==null||comics.isEmpty())return;Snapshot snapshot=load(context);for(EhClient.Comic comic:comics)if(comic!=null&&EhClient.isEhId(comic.id))apply(snapshot,comic);save(context,snapshot);}

    static Record get(Context context,String comicId){return load(context).byComicId.get(comicId);}

    static List<Tag> tags(Context context,String comicId){Record r=get(context,comicId);return r==null?Collections.emptyList():new ArrayList<>(r.rawTags);}

    private static void apply(Snapshot snapshot,EhClient.Comic comic){
        Record r=snapshot.byComicId.get(comic.id);if(r==null){r=new Record(comic.id);snapshot.byComicId.put(comic.id,r);}r.rawCategory=safe(comic.category);r.rawTags.clear();for(String raw:comic.rawTags){Tag tag=parse(raw);if(!tag.value.isEmpty())addUnique(r.rawTags,tag);}String surface=safe(comic.surface).toLowerCase(Locale.ROOT);if("eh".equals(surface)||"exh".equals(surface))r.surfaceBindings.add(surface);r.updatedAt=Instant.now().toString();
    }

    private static Tag parse(String raw){String value=safe(raw).trim();int at=value.indexOf(':');if(at>0)return new Tag(value.substring(0,at),value.substring(at+1));return new Tag("",value);}
    private static void addUnique(List<Tag> out,Tag tag){for(Tag existing:out)if(existing.canonical.equals(tag.canonical))return;out.add(tag);}

    private static void save(Context context,Snapshot snapshot){
        try{snapshot.updatedAt=Instant.now().toString();JSONObject root=new JSONObject();root.put("schemaVersion",1);root.put("updatedAt",snapshot.updatedAt);JSONArray rows=new JSONArray();for(Record r:snapshot.byComicId.values()){JSONObject o=new JSONObject();o.put("comicId",r.comicId);o.put("rawCategory",r.rawCategory);o.put("surfaceBindings",new JSONArray(r.surfaceBindings));o.put("updatedAt",r.updatedAt);JSONArray tags=new JSONArray();for(Tag tag:r.rawTags){JSONObject t=new JSONObject();t.put("namespace",tag.namespace);t.put("value",tag.value);t.put("canonical",tag.canonical);tags.put(t);}o.put("rawTags",tags);rows.put(o);}root.put("records",rows);File target=file(context);target.getParentFile().mkdirs();File tmp=new File(target.getParentFile(),target.getName()+".tmp");try(OutputStream out=new FileOutputStream(tmp)){out.write(root.toString().getBytes(StandardCharsets.UTF_8));}if(target.exists()&&!target.delete())throw new IOException("E-H semantic store replace failed");if(!tmp.renameTo(target))throw new IOException("E-H semantic store rename failed");}catch(Exception e){throw new IllegalStateException("无法保存 E-H 语义数据",e);}
    }

    static String norm(String value){return safe(value).trim().toLowerCase(Locale.ROOT).replaceAll("\\s+"," ");}
    private static String normValue(String value){return norm(value);}
    private static String safe(String value){return value==null?"":value;}
}
