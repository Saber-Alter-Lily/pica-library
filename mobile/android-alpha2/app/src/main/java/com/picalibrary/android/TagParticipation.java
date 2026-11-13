package com.picalibrary.android;

import android.content.Context;
import com.picalibrary.android.tags.TagPolicyRules;
import java.util.*;
import org.json.*;

/** Compatibility/application facade. Matching and normalization live in the pure tags module. */
final class TagParticipation {
    static final String PREFIX=TagPolicyRules.PRIVATE_PREFIX;
    private static final Map<JSONObject,TagParticipation> CACHE=Collections.synchronizedMap(new WeakHashMap<>());
    private static final Map<JSONObject,TagParticipation> LEGACY_STATES=Collections.synchronizedMap(new WeakHashMap<>());
    final TagPolicyRules rules;
    final JSONObject json;
    final String mode;
    final Set<String> selected,disabled;
    final List<JSONObject> privateTags;
    private TagFactSnapshot factSnapshot=TagFactSnapshot.empty();
    private boolean factsLoaded;
    private static final TagParticipation LEGACY=new TagParticipation(TagPolicyRules.legacy());

    private TagParticipation(TagPolicyRules rules){
        this.rules=rules;json=TagPolicyJson.write(rules);mode=rules.mode;selected=rules.selected;disabled=rules.disabled;
        List<JSONObject> tags=new ArrayList<>();JSONArray values=json.optJSONArray("privateTags");
        for(int i=0;i<values.length();i++)tags.add(values.optJSONObject(i));privateTags=Collections.unmodifiableList(tags);
    }
    static String norm(String raw){return TagPolicyRules.normalizeKey(raw);}
    static String provider(String id){return TagPolicyRules.provider(id);}
    static String identity(String provider,String raw){return TagPolicyRules.identity(provider,raw);}
    static JSONObject normalize(JSONObject source){return TagPolicyJson.write(TagPolicyJson.read(source));}
    static TagParticipation of(JSONObject state){
        Object value=state==null?null:state.opt("tagPolicy");
        if(value==null||value==JSONObject.NULL){
            if(state==null)return LEGACY;
            TagParticipation cached=LEGACY_STATES.get(state);
            if(cached==null){cached=new TagParticipation(TagPolicyRules.legacy());LEGACY_STATES.put(state,cached);}return cached;
        }
        if(!(value instanceof JSONObject))throw new IllegalArgumentException("Invalid tag policy");
        JSONObject source=(JSONObject)value;TagParticipation cached=CACHE.get(source);
        if(cached==null){cached=new TagParticipation(TagPolicyJson.read(source));CACHE.put(source,cached);}return cached;
    }
    static TagParticipation of(Context context,JSONObject state){
        if(state==null)state=new JSONObject();TagParticipation policy=of(state);
        synchronized(policy){if(!policy.factsLoaded){policy.factSnapshot=TagFactSnapshot.load(context);policy.factsLoaded=true;}}
        return policy;
    }
    List<String> facts(String id,Collection<String> fallback){return factSnapshot.facts(id,fallback);}
    TagPolicyRules.Comic comic(String id,Collection<String> tags,boolean favorite){
        return new TagPolicyRules.Comic(id,null,facts(id,tags),null,favorite);
    }
    static String semanticValue(String id,String raw){return TagPolicyRules.semanticValue(provider(id),raw);}
    EhSemanticStore.Snapshot semanticView(EhSemanticStore.Snapshot original){return factSnapshot.semanticView(original);}
    static Set<String> set(JSONArray values){
        Set<String> out=new LinkedHashSet<>();if(values!=null)for(int i=0;i<values.length();i++)out.add(values.optString(i));return out;
    }
    boolean enabled(String identity){return rules.enabled(identity);}
    boolean rawEnabled(String id,String raw){return rules.rawEnabled(provider(id),raw);}
    JSONObject privateTag(String key){
        TagPolicyRules.PrivateTag found=rules.privateTag(key);if(found==null)return null;
        for(JSONObject tag:privateTags)if(found.id.equals(tag.optString("id")))return tag;return null;
    }
    boolean matches(JSONObject tag,String id,Collection<String> rawTags){
        TagPolicyRules.PrivateTag found=rules.privateTag(PREFIX+tag.optString("id"));
        return found!=null&&found.matches(comic(id,rawTags,false));
    }
    boolean matchesPrivate(String key,String id,Collection<String> rawTags){return rules.matchesPrivate(key,comic(id,rawTags,false));}
    boolean controlEnabled(String type,String key,String id){return controlEnabled(type,key,id,Collections.emptyList());}
    boolean controlEnabled(String type,String key,String id,Collection<String> tags){return rules.controlEnabled(type,key,id==null?null:comic(id,tags,false));}
    List<String> tags(String id,Collection<String> rawTags,boolean includePrivate){return rules.tags(comic(id,rawTags,false),includePrivate);}
    PicaClient.Comic project(PicaClient.Comic c,boolean includePrivate){
        return new PicaClient.Comic(c.id,c.title,c.author,c.description,c.coverUrl,c.chineseTeam,tags(c.id,c.tags,includePrivate),c.categories,c.finished,c.favorite,c.pagesCount,c.epsCount,c.totalLikes,c.totalViews);
    }
    String label(String key){TagPolicyRules.PrivateTag tag=rules.privateTag(key);return tag==null?key:tag.name;}
    String signature(){return TagPolicyJson.write(rules).toString();}
    static boolean same(JSONObject a,JSONObject b){return of(a).signature().equals(of(b).signature());}
}
