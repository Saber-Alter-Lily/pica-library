package com.picalibrary.android;

import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.*;

/**
 * Portable Recommendation V5 state cached from Desktop.
 * Desktop remains the heavy-compute authority; Android reuses the same explicit
 * controls for lightweight offline filtering/ranking and queues local mutations
 * for the next pairing sync.
 */
final class RecommendationPolicyStore {
    private static final String PREFS="recommendation-policy-v5";
    private static final String SNAPSHOT="snapshot";
    private static final String DIRTY_CONTROLS="dirtyControls";
    private static final String DIRTY_SESSION_INTENT="dirtySessionIntent";
    private static final String DIRTY_SUPPRESS="dirtySuppress";
    private static final String DIRTY_CLEAR_SUPPRESS="dirtyClearSuppress";
    private static final String MUTATION_ID="mutationId";
    private RecommendationPolicyStore(){}

    private static SharedPreferences prefs(Context c){return c.getApplicationContext().getSharedPreferences(PREFS,Context.MODE_PRIVATE);}
    private static JSONObject parseObject(String raw){try{return new JSONObject(raw==null?"{}":raw);}catch(Exception e){return new JSONObject();}}
    private static JSONArray parseArray(String raw){try{return new JSONArray(raw==null?"[]":raw);}catch(Exception e){return new JSONArray();}}
    private static String norm(String value){return value==null?"":java.text.Normalizer.normalize(value,java.text.Normalizer.Form.NFKC).trim().toLowerCase(Locale.ROOT).replaceAll("\\s+"," ");}
    private static void touchMutation(Context c){prefs(c).edit().putString(MUTATION_ID,UUID.randomUUID().toString()).apply();}

    static JSONObject snapshot(Context c){return parseObject(prefs(c).getString(SNAPSHOT,"{}"));}
    static void saveSnapshot(Context c,JSONObject value){if(value==null)return;prefs(c).edit().putString(SNAPSHOT,value.toString()).apply();}
    static int revision(Context c){return snapshot(c).optInt("revision",0);}
    static int pendingCount(Context c){
        int count=parseArray(prefs(c).getString(DIRTY_CONTROLS,"[]")).length();
        count+=parseArray(prefs(c).getString(DIRTY_SUPPRESS,"[]")).length();
        count+=parseArray(prefs(c).getString(DIRTY_CLEAR_SUPPRESS,"[]")).length();
        if(!parseObject(prefs(c).getString(DIRTY_SESSION_INTENT,"{}" )).keys().hasNext()){}else count++;
        count+=RecommendationFeedbackStore.dirtyPayload(c).length();
        return count;
    }

    static JSONArray inferred(Context c){JSONArray arr=snapshot(c).optJSONArray("inferred");return arr==null?new JSONArray():arr;}
    static JSONArray controls(Context c){JSONArray arr=snapshot(c).optJSONArray("controls");return arr==null?new JSONArray():arr;}
    static JSONObject sessionIntent(Context c){JSONObject value=snapshot(c).optJSONObject("sessionIntent");return value==null?new JSONObject():value;}

    private static boolean matches(String author,Collection<String> tags,Collection<String> categories,String type,String key){
        String wanted=norm(key);if(wanted.isEmpty())return false;
        if("AUTHOR".equals(type))return norm(author).equals(wanted);
        if("CATEGORY".equals(type)){if(categories!=null)for(String value:categories)if(norm(value).equals(wanted))return true;return false;}
        if("TAG".equals(type)||"FANDOM".equals(type)){if(tags!=null)for(String value:tags)if(norm(value).equals(wanted))return true;return false;}
        return false;
    }
    private static boolean matches(PicaClient.Comic comic,String type,String key){return comic!=null&&matches(comic.author,comic.tags,comic.categories,type,key);}
    private static boolean matches(NativeRecommendationStore.Item item,String type,String key){return item!=null&&matches(item.author,item.tags,item.categories,type,key);}

    private static boolean suppressed(JSONObject state,String comicId){JSONArray ids=state.optJSONArray("hardSuppressComicIds");if(ids==null)return false;for(int i=0;i<ids.length();i++)if(comicId.equals(ids.optString(i)))return true;return false;}
    private static boolean blockedByControls(JSONObject state,String author,Collection<String> tags,Collection<String> categories){JSONArray arr=state.optJSONArray("controls");if(arr==null)return false;for(int i=0;i<arr.length();i++){JSONObject row=arr.optJSONObject(i);if(row!=null&&"BLOCK".equals(row.optString("direction"))&&matches(author,tags,categories,row.optString("targetType"),row.optString("key")))return true;}return false;}

    static boolean blocked(Context c,PicaClient.Comic comic){if(comic==null)return false;JSONObject state=snapshot(c);return suppressed(state,comic.id)||blockedByControls(state,comic.author,comic.tags,comic.categories);}
    static boolean blocked(Context c,NativeRecommendationStore.Item item){if(item==null)return false;JSONObject state=snapshot(c);return suppressed(state,item.comicId)||blockedByControls(state,item.author,item.tags,item.categories);}

    private static double adjustment(JSONObject state,String author,Collection<String> tags,Collection<String> categories){
        double score=0;JSONArray arr=state.optJSONArray("controls");if(arr!=null)for(int i=0;i<arr.length();i++){JSONObject row=arr.optJSONObject(i);if(row==null||!matches(author,tags,categories,row.optString("targetType"),row.optString("key")))continue;String direction=row.optString("direction");boolean session="SESSION".equals(row.optString("scope"));if("MORE".equals(direction))score+=session?0.12:0.08;else if("LESS".equals(direction))score-=session?0.12:0.08;}
        JSONObject intent=state.optJSONObject("sessionIntent");if(intent!=null&&"TARGET".equals(intent.optString("mode"))&&matches(author,tags,categories,intent.optString("targetType"),intent.optString("key")))score+=0.16;
        return Math.max(-0.30,Math.min(0.30,score));
    }
    static double adjustment(Context c,PicaClient.Comic comic){return comic==null?0:adjustment(snapshot(c),comic.author,comic.tags,comic.categories);}
    static double adjustment(Context c,NativeRecommendationStore.Item item){return item==null?0:adjustment(snapshot(c),item.author,item.tags,item.categories);}

    static List<NativeRecommendationStore.Item> applyCachedPolicy(Context c,List<NativeRecommendationStore.Item> source){
        final Map<String,Integer> order=new HashMap<>();List<NativeRecommendationStore.Item> out=new ArrayList<>();int index=0;
        for(NativeRecommendationStore.Item item:source){order.put(item.comicId,index++);if(blocked(c,item)||RecommendationFeedbackStore.hasFeedback(c,item.comicId))continue;out.add(item);}
        out.sort((a,b)->{double as=a.score+adjustment(c,a),bs=b.score+adjustment(c,b);int by=Double.compare(bs,as);return by!=0?by:Integer.compare(order.getOrDefault(a.comicId,0),order.getOrDefault(b.comicId,0));});
        return out;
    }

    static void setLocalControl(Context c,String targetType,String key,String label,String direction,String scope){
        String type=targetType==null?"":targetType.trim().toUpperCase(Locale.ROOT),cleanKey=norm(key),dir=direction==null?"DEFAULT":direction.trim().toUpperCase(Locale.ROOT);if(cleanKey.isEmpty())return;
        JSONObject state=snapshot(c);JSONArray current=state.optJSONArray("controls");if(current==null)current=new JSONArray();JSONArray next=new JSONArray();String identity=type+":"+cleanKey;
        for(int i=0;i<current.length();i++){JSONObject row=current.optJSONObject(i);if(row==null)continue;String id=row.optString("targetType")+":"+norm(row.optString("key"));if(!identity.equals(id))next.put(row);}
        if(!"DEFAULT".equals(dir)){JSONObject row=new JSONObject();try{row.put("targetType",type);row.put("key",cleanKey);row.put("label",label==null?key:label);row.put("direction",dir);row.put("scope","SESSION".equals(scope)?"SESSION":"PERSISTENT");row.put("source","ANDROID");row.put("updatedAt",java.time.Instant.now().toString());next.put(row);}catch(Exception ignored){}}
        try{state.put("controls",next);}catch(Exception ignored){}saveSnapshot(c,state);
        JSONArray dirty=parseArray(prefs(c).getString(DIRTY_CONTROLS,"[]"));JSONArray filtered=new JSONArray();for(int i=0;i<dirty.length();i++){JSONObject row=dirty.optJSONObject(i);if(row==null)continue;String id=row.optString("targetType")+":"+norm(row.optString("key"));if(!identity.equals(id))filtered.put(row);}JSONObject mutation=new JSONObject();try{mutation.put("targetType",type);mutation.put("key",cleanKey);mutation.put("label",label==null?key:label);mutation.put("direction",dir);mutation.put("scope","SESSION".equals(scope)?"SESSION":"PERSISTENT");filtered.put(mutation);}catch(Exception ignored){}prefs(c).edit().putString(DIRTY_CONTROLS,filtered.toString()).putString(MUTATION_ID,UUID.randomUUID().toString()).apply();
    }

    static void setSessionIntent(Context c,String mode,String targetType,String key,String label){
        String cleanMode=mode==null?"DEFAULT":mode.trim().toUpperCase(Locale.ROOT);if(!Arrays.asList("DEFAULT","FAMILIAR","EXPLORE","RECENT","TARGET").contains(cleanMode))cleanMode="DEFAULT";
        JSONObject intent=new JSONObject();try{intent.put("mode",cleanMode);if("TARGET".equals(cleanMode)){intent.put("targetType",targetType==null?"TAG":targetType.trim().toUpperCase(Locale.ROOT));intent.put("key",norm(key));intent.put("label",label==null?key:label);}intent.put("source","ANDROID");intent.put("updatedAt",java.time.Instant.now().toString());}catch(Exception ignored){}
        JSONObject state=snapshot(c);try{state.put("sessionIntent",intent);}catch(Exception ignored){}saveSnapshot(c,state);prefs(c).edit().putString(DIRTY_SESSION_INTENT,intent.toString()).putString(MUTATION_ID,UUID.randomUUID().toString()).apply();
    }
    static void clearSessionIntent(Context c){setSessionIntent(c,"DEFAULT",null,null,null);}

    static void suppress(Context c,String comicId,boolean value){
        String id=comicId==null?"":comicId.trim();if(id.isEmpty())return;
        JSONObject state=snapshot(c);LinkedHashSet<String> current=new LinkedHashSet<>();JSONArray existing=state.optJSONArray("hardSuppressComicIds");if(existing!=null)for(int i=0;i<existing.length();i++){String x=existing.optString(i);if(!x.isEmpty())current.add(x);}if(value)current.add(id);else current.remove(id);try{state.put("hardSuppressComicIds",new JSONArray(current));}catch(Exception ignored){}saveSnapshot(c,state);
        String addKey=value?DIRTY_SUPPRESS:DIRTY_CLEAR_SUPPRESS,removeKey=value?DIRTY_CLEAR_SUPPRESS:DIRTY_SUPPRESS;LinkedHashSet<String> add=new LinkedHashSet<>(),remove=new LinkedHashSet<>();JSONArray a=parseArray(prefs(c).getString(addKey,"[]")),r=parseArray(prefs(c).getString(removeKey,"[]"));for(int i=0;i<a.length();i++)add.add(a.optString(i));for(int i=0;i<r.length();i++)remove.add(r.optString(i));add.add(id);remove.remove(id);prefs(c).edit().putString(addKey,new JSONArray(add).toString()).putString(removeKey,new JSONArray(remove).toString()).putString(MUTATION_ID,UUID.randomUUID().toString()).apply();
    }

    static JSONObject syncPayload(Context c){JSONObject body=new JSONObject();try{body.put("deviceId",DeviceIdentity.id(c));String mutation=prefs(c).getString(MUTATION_ID,"");if(mutation==null||mutation.isEmpty())mutation=UUID.randomUUID().toString();body.put("mutationId",mutation);body.put("controls",parseArray(prefs(c).getString(DIRTY_CONTROLS,"[]")));JSONObject intent=parseObject(prefs(c).getString(DIRTY_SESSION_INTENT,"{}"));if(intent.keys().hasNext())body.put("sessionIntent",intent);body.put("feedback",RecommendationFeedbackStore.dirtyPayload(c));body.put("suppressComicIds",parseArray(prefs(c).getString(DIRTY_SUPPRESS,"[]")));body.put("clearSuppressComicIds",parseArray(prefs(c).getString(DIRTY_CLEAR_SUPPRESS,"[]")));}catch(Exception ignored){}return body;}

    static void acknowledge(Context c,JSONObject response){JSONObject value=response==null?null:response.optJSONObject("snapshot");if(value!=null)saveSnapshot(c,value);prefs(c).edit().remove(DIRTY_CONTROLS).remove(DIRTY_SESSION_INTENT).remove(DIRTY_SUPPRESS).remove(DIRTY_CLEAR_SUPPRESS).remove(MUTATION_ID).apply();RecommendationFeedbackStore.clearDirty(c);}
}
