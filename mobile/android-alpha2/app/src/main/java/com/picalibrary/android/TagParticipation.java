package com.picalibrary.android;

import java.nio.charset.StandardCharsets;
import java.text.Normalizer;
import java.util.*;
import org.json.*;

/** Immutable personal signal view. Provider facts and raw safety checks are never rewritten. */
final class TagParticipation {
    static final String PREFIX="@private/";
    private static final Map<JSONObject,TagParticipation> CACHE=Collections.synchronizedMap(new WeakHashMap<>());
    final JSONObject json;
    final String mode;
    final Set<String> selected,disabled;
    final List<JSONObject> privateTags;
    private final Map<String,Set<String>> comicBindings=new HashMap<>(),mappingBindings=new HashMap<>();
    private static final TagParticipation LEGACY=new TagParticipation(normalize(null));
    private TagParticipation(JSONObject normalized){
        json=normalized;mode=json.optString("mode");selected=set(json.optJSONArray("selected"));disabled=set(json.optJSONArray("disabled"));privateTags=new ArrayList<>();
        JSONArray tags=json.optJSONArray("privateTags");for(int i=0;i<tags.length();i++){JSONObject tag=tags.optJSONObject(i);privateTags.add(tag);comicBindings.put(tag.optString("id"),set(tag.optJSONArray("comicIds")));mappingBindings.put(tag.optString("id"),set(tag.optJSONArray("mappings")));}
    }
    static String norm(String raw){return Normalizer.normalize(raw==null?"":raw,Normalizer.Form.NFKC).replaceAll("[\\p{Z}\\s\\uFEFF]+"," ").trim().toLowerCase(Locale.ROOT);}
    static String provider(String id){return id!=null&&id.startsWith("eh:")?"eh":id!=null&&id.startsWith("jm:")?"jm":"pica";}
    static String identity(String provider,String raw){return provider+"|"+norm(raw);}
    static TagParticipation of(JSONObject state){
        Object value=state==null?null:state.opt("tagPolicy");if(value==null||value==JSONObject.NULL)return LEGACY;
        if(!(value instanceof JSONObject))throw new IllegalArgumentException("Invalid tag policy");
        JSONObject source=(JSONObject)value;TagParticipation cached=CACHE.get(source);if(cached==null){cached=new TagParticipation(normalize(source));CACHE.put(source,cached);}return cached;
    }
    static Set<String> set(JSONArray values){Set<String> out=new LinkedHashSet<>();if(values!=null)for(int i=0;i<values.length();i++)out.add(values.optString(i));return out;}
    private static JSONArray strings(JSONObject source,String field,boolean identities){
        JSONArray raw=source.optJSONArray(field);if(raw==null||raw.length()>4096)throw new IllegalArgumentException("Invalid or oversized tag-policy list");
        TreeSet<String> sorted=new TreeSet<>();for(int i=0;i<raw.length();i++){
            Object value=raw.opt(i);if(!(value instanceof String))throw new IllegalArgumentException("Invalid tag-policy string");String clean=norm((String)value);if(clean.isEmpty())continue;
            if(identities){int split=clean.indexOf('|');String provider=split<0?"":clean.substring(0,split),key=split<0?"":clean.substring(split+1);if(!Arrays.asList("pica","eh","jm","private").contains(provider)||key.isEmpty()||key.length()>200||("private".equals(provider)&&!key.matches("pt_[a-f0-9]{32}")))throw new IllegalArgumentException("Invalid provider-scoped tag identity");}
            else if(clean.length()>200)throw new IllegalArgumentException("Invalid comic identity");sorted.add(clean);
        }return new JSONArray(sorted);
    }
    static JSONObject normalize(JSONObject source){
        try{
            if(source==null)return new JSONObject().put("schemaVersion",1).put("mode","ALL").put("selected",new JSONArray()).put("disabled",new JSONArray()).put("privateTags",new JSONArray());
            if(!(source.opt("schemaVersion") instanceof Number)||source.optDouble("schemaVersion",0)!=1d||!Arrays.asList("ALL","SELECTED").contains(source.optString("mode")))throw new IllegalArgumentException("Unsupported tag policy");
            JSONArray raw=source.optJSONArray("privateTags");if(raw==null||raw.length()>100)throw new IllegalArgumentException("Invalid private tags");
            TreeMap<String,JSONObject> tags=new TreeMap<>();int bindings=0;
            for(int i=0;i<raw.length();i++){
                JSONObject row=raw.optJSONObject(i);if(row==null)throw new IllegalArgumentException("Invalid private tag");String id=row.optString("id"),name=Normalizer.normalize(row.optString("name"),Normalizer.Form.NFKC).trim(),kind=row.optString("kind");
                if(!id.matches("pt_[a-f0-9]{32}")||tags.containsKey(id)||name.isEmpty()||name.length()>80||name.matches("(?s).*[\\x00-\\x1f\\x7f].*")||!Arrays.asList("MANUAL","MAPPED").contains(kind))throw new IllegalArgumentException("Invalid private tag");
                JSONArray comicIds=strings(row,"comicIds",false),mappings=strings(row,"mappings",true);
                for(int j=0;j<mappings.length();j++)if(mappings.optString(j).startsWith("private|"))throw new IllegalArgumentException("Private tags cannot reference private tags");
                if(("MANUAL".equals(kind)&&mappings.length()>0)||("MAPPED".equals(kind)&&comicIds.length()>0))throw new IllegalArgumentException("Mixed private-tag modes");
                bindings+=comicIds.length()+mappings.length();if(bindings>4096)throw new IllegalArgumentException("Too many private-tag bindings");
                tags.put(id,new JSONObject().put("id",id).put("name",name).put("kind",kind).put("comicIds",comicIds).put("mappings",mappings));
            }
            JSONObject out=new JSONObject().put("schemaVersion",1).put("mode",source.optString("mode")).put("selected",strings(source,"selected",true)).put("disabled",strings(source,"disabled",true)).put("privateTags",new JSONArray(tags.values()));
            if(out.toString().getBytes(StandardCharsets.UTF_8).length>128*1024)throw new IllegalArgumentException("Tag policy exceeds 128 KiB");return out;
        }catch(JSONException error){throw new IllegalArgumentException("Invalid tag policy",error);}
    }
    boolean enabled(String identity){return "ALL".equals(mode)?!disabled.contains(identity):selected.contains(identity);}
    boolean rawEnabled(String id,String raw){return enabled(identity(provider(id),raw));}
    JSONObject privateTag(String key){String normalized=norm(key);for(JSONObject tag:privateTags)if((PREFIX+tag.optString("id")).equals(normalized))return tag;return null;}
    boolean matches(JSONObject tag,String id,Collection<String> rawTags){
        if("MANUAL".equals(tag.optString("kind")))return comicBindings.getOrDefault(tag.optString("id"),Collections.emptySet()).contains(norm(id));
        Set<String> mappings=mappingBindings.getOrDefault(tag.optString("id"),Collections.emptySet());for(String raw:rawTags)if(mappings.contains(identity(provider(id),raw)))return true;return false;
    }
    boolean matchesPrivate(String key,String id,Collection<String> rawTags){JSONObject tag=privateTag(key);return tag!=null&&matches(tag,id,rawTags);}
    boolean controlEnabled(String type,String key,String id){
        if(!"TAG".equals(type)&&!"FANDOM".equals(type))return true;
        JSONObject tag=privateTag(key);if(norm(key).startsWith(PREFIX))return tag!=null&&enabled(identity("private",tag.optString("id")));
        if(id!=null)return rawEnabled(id,key);for(String provider:Arrays.asList("pica","eh","jm"))if(enabled(identity(provider,key)))return true;return false;
    }
    List<String> tags(String id,Collection<String> rawTags,boolean includePrivate){
        LinkedHashSet<String> out=new LinkedHashSet<>();for(String raw:rawTags)if(!norm(raw).startsWith(PREFIX)&&rawEnabled(id,raw))out.add(raw);
        if(includePrivate)for(JSONObject tag:privateTags)if(enabled(identity("private",tag.optString("id")))&&matches(tag,id,rawTags))out.add(PREFIX+tag.optString("id"));return new ArrayList<>(out);
    }
    PicaClient.Comic project(PicaClient.Comic c,boolean includePrivate){return new PicaClient.Comic(c.id,c.title,c.author,c.description,c.coverUrl,c.chineseTeam,tags(c.id,c.tags,includePrivate),c.categories,c.finished,c.favorite,c.pagesCount,c.epsCount,c.totalLikes,c.totalViews);}
    String label(String key){JSONObject tag=privateTag(key);return tag==null?key:tag.optString("name");}
    String signature(){StringBuilder out=new StringBuilder(mode).append('|').append(json.optJSONArray("selected")).append('|').append(json.optJSONArray("disabled"));for(JSONObject tag:privateTags)out.append('|').append(tag.optString("id")).append('|').append(JSONObject.quote(tag.optString("name"))).append('|').append(tag.optString("kind")).append('|').append(tag.optJSONArray("comicIds")).append('|').append(tag.optJSONArray("mappings"));return out.toString();}
    static boolean same(JSONObject a,JSONObject b){return of(a).signature().equals(of(b).signature());}
}
