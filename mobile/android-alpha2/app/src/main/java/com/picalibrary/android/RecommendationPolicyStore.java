package com.picalibrary.android;

import android.content.Context;
import android.content.SharedPreferences;
import java.text.Normalizer;
import java.time.Instant;
import java.util.*;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Portable Recommendation V5 state cached from Desktop.
 * Desktop remains the heavy-compute authority. Android keeps the same explicit
 * controls, can re-rank a synced cache offline, and queues mutations for pairing.
 */
final class RecommendationPolicyStore {
    private static final String PREFS="recommendation-policy-v5";
    private static final String SNAPSHOT="snapshot";
    private static final String DIRTY_CONTROLS="dirtyControls";
    private static final String DIRTY_SESSION="dirtySessionIntent";
    private static final String DIRTY_SUPPRESS="dirtySuppress";
    private static final String DIRTY_CLEAR_SUPPRESS="dirtyClearSuppress";
    private static final String MUTATION_ID="mutationId";
    private RecommendationPolicyStore(){}

    private static SharedPreferences prefs(Context c){return c.getApplicationContext().getSharedPreferences(PREFS,Context.MODE_PRIVATE);}
    private static JSONObject parseObject(String raw){try{return new JSONObject(raw==null?"{}":raw);}catch(Exception e){return new JSONObject();}}
    private static JSONArray parseArray(String raw){try{return new JSONArray(raw==null?"[]":raw);}catch(Exception e){return new JSONArray();}}
    private static String norm(String value){return value==null?"":Normalizer.normalize(value,Normalizer.Form.NFKC).trim().toLowerCase(Locale.ROOT).replaceAll("\\s+"," ");}
    private static String now(){return Instant.now().toString();}
    private static boolean listContains(Collection<String> values,String wanted){if(values==null)return false;for(String value:values)if(norm(value).equals(wanted))return true;return false;}

    static JSONObject snapshot(Context c){return parseObject(prefs(c).getString(SNAPSHOT,"{}"));}
    static void saveSnapshot(Context c,JSONObject value){if(value==null)return;prefs(c).edit().putString(SNAPSHOT,value.toString()).apply();}
    static int revision(Context c){return snapshot(c).optInt("revision",0);}
    static JSONArray inferred(Context c){JSONArray arr=snapshot(c).optJSONArray("inferred");return arr==null?new JSONArray():arr;}
    static JSONArray controls(Context c){JSONArray arr=snapshot(c).optJSONArray("controls");return arr==null?new JSONArray():arr;}

    private static boolean matches(PicaClient.Comic comic,String type,String key){
        String wanted=norm(key);if(wanted.isEmpty()||comic==null)return false;
        if("AUTHOR".equals(type))return norm(comic.author).equals(wanted);
        if("CATEGORY".equals(type))return listContains(comic.categories,wanted);
        if("TAG".equals(type)||"FANDOM".equals(type))return listContains(comic.tags,wanted);
        return false;
    }

    private static boolean matches(NativeRecommendationStore.Item item,String type,String key){
        String wanted=norm(key);if(wanted.isEmpty()||item==null)return false;
        if("AUTHOR".equals(type))return norm(item.author).equals(wanted);
        if("CATEGORY".equals(type))return listContains(item.categories,wanted);
        if("TAG".equals(type)||"FANDOM".equals(type))return listContains(item.tags,wanted);
        if("STYLE_FAMILY".equals(type))return norm(item.family).equals(wanted);
        return false;
    }

    private static boolean hardSuppressed(JSONObject state,String comicId){JSONArray arr=state.optJSONArray("hardSuppressComicIds");if(arr==null)return false;for(int i=0;i<arr.length();i++)if(comicId.equals(arr.optString(i)))return true;return false;}

    static boolean blocked(Context c,PicaClient.Comic comic){
        JSONObject state=snapshot(c);if(comic==null)return false;if(hardSuppressed(state,comic.id))return true;
        JSONArray arr=state.optJSONArray("controls");if(arr!=null)for(int i=0;i<arr.length();i++){JSONObject row=arr.optJSONObject(i);if(row!=null&&"BLOCK".equals(row.optString("direction"))&&matches(comic,row.optString("targetType"),row.optString("key")))return true;}
        return false;
    }

    static double adjustment(Context c,PicaClient.Comic comic){
        JSONObject state=snapshot(c);double score=0;JSONArray arr=state.optJSONArray("controls");if(arr!=null)for(int i=0;i<arr.length();i++){JSONObject row=arr.optJSONObject(i);if(row==null||!matches(comic,row.optString("targetType"),row.optString("key")))continue;String direction=row.optString("direction");boolean session="SESSION".equals(row.optString("scope"));if("MORE".equals(direction))score+=session?0.12:0.08;else if("LESS".equals(direction))score-=session?0.12:0.08;}
        JSONObject intent=state.optJSONObject("sessionIntent");if(intent!=null&&"TARGET".equals(intent.optString("mode"))&&matches(comic,intent.optString("targetType"),intent.optString("key")))score+=0.16;
        return Math.max(-0.30,Math.min(0.30,score));
    }

    private static boolean blocked(JSONObject state,NativeRecommendationStore.Item item){
        if(hardSuppressed(state,item.comicId))return true;JSONArray arr=state.optJSONArray("controls");if(arr!=null)for(int i=0;i<arr.length();i++){JSONObject row=arr.optJSONObject(i);if(row!=null&&"BLOCK".equals(row.optString("direction"))&&matches(item,row.optString("targetType"),row.optString("key")))return true;}return false;
    }

    private static double adjustment(JSONObject state,NativeRecommendationStore.Item item){
        double score=0;JSONArray arr=state.optJSONArray("controls");if(arr!=null)for(int i=0;i<arr.length();i++){JSONObject row=arr.optJSONObject(i);if(row==null||!matches(item,row.optString("targetType"),row.optString("key")))continue;String direction=row.optString("direction");boolean session="SESSION".equals(row.optString("scope"));if("MORE".equals(direction))score+=session?0.12:0.08;else if("LESS".equals(direction))score-=session?0.12:0.08;}
        JSONObject intent=state.optJSONObject("sessionIntent");if(intent!=null&&"TARGET".equals(intent.optString("mode"))&&matches(item,intent.optString("targetType"),intent.optString("key")))score+=0.16;
        return Math.max(-0.30,Math.min(0.30,score));
    }

    /** Apply only cheap portable policy operations. It never performs provider recall or visual inference. */
    static NativeRecommendationStore.Snapshot applyLocalPolicy(Context c,NativeRecommendationStore.Snapshot source){
        NativeRecommendationStore.Snapshot out=new NativeRecommendationStore.Snapshot();if(source==null)return out;
        out.cycleId=source.cycleId;out.generatedAt=source.generatedAt;out.favoriteFingerprint=source.favoriteFingerprint;out.registryFingerprint=source.registryFingerprint;out.readiness=source.readiness;out.favoriteCount=source.favoriteCount;out.displayedIds.addAll(source.displayedIds);out.cooldownIds.addAll(source.cooldownIds);
        JSONObject state=snapshot(c);final class RankedItem{final NativeRecommendationStore.Item item;final double adjusted;final int order;RankedItem(NativeRecommendationStore.Item item,double adjusted,int order){this.item=item;this.adjusted=adjusted;this.order=order;}}
        LinkedHashMap<String,RankedItem> unique=new LinkedHashMap<>();int order=0;for(List<NativeRecommendationStore.Item> batch:source.batches)for(NativeRecommendationStore.Item item:batch){if(item==null||item.comicId.isEmpty()){order++;continue;}if(RecommendationFeedbackStore.hasFeedback(c,item.comicId)||blocked(state,item)){order++;continue;}if(!unique.containsKey(item.comicId))unique.put(item.comicId,new RankedItem(item,item.score+adjustment(state,item),order));order++;}
        List<RankedItem> rows=new ArrayList<>(unique.values());rows.sort((a,b)->{int byScore=Double.compare(b.adjusted,a.adjusted);return byScore!=0?byScore:Integer.compare(a.order,b.order);});
        List<NativeRecommendationStore.Item> batch=new ArrayList<>();for(RankedItem row:rows){batch.add(row.item);if(batch.size()>=NativeRecommendationPolicy.BATCH_SIZE){out.batches.add(batch);batch=new ArrayList<>();}}if(!batch.isEmpty())out.batches.add(batch);out.candidateCount=rows.size();out.batchIndex=out.batches.isEmpty()?0:Math.min(Math.max(0,source.batchIndex),out.batches.size()-1);return out;
    }

    static void setLocalControl(Context c,String targetType,String key,String label,String direction,String scope){
        String type=targetType==null?"":targetType.trim().toUpperCase(Locale.ROOT),cleanKey=norm(key),dir=direction==null?"DEFAULT":direction.trim().toUpperCase(Locale.ROOT);if(cleanKey.isEmpty())return;
        JSONObject state=snapshot(c);JSONArray current=state.optJSONArray("controls");if(current==null)current=new JSONArray();JSONArray next=new JSONArray();String identity=type+":"+cleanKey;for(int i=0;i<current.length();i++){JSONObject row=current.optJSONObject(i);if(row==null)continue;String id=row.optString("targetType")+":"+norm(row.optString("key"));if(!identity.equals(id))next.put(row);}
        JSONObject mutation=new JSONObject();try{mutation.put("targetType",type);mutation.put("key",cleanKey);mutation.put("label",label==null?key:label);mutation.put("direction",dir);mutation.put("scope","SESSION".equals(scope)?"SESSION":"PERSISTENT");mutation.put("source","ANDROID");mutation.put("updatedAt",now());if(!"DEFAULT".equals(dir))next.put(new JSONObject(mutation.toString()));state.put("controls",next);state.put("updatedAt",now());}catch(Exception e){throw new IllegalStateException("无法更新本机推荐偏好",e);}saveSnapshot(c,state);
        JSONArray dirty=parseArray(prefs(c).getString(DIRTY_CONTROLS,"[]"));JSONArray filtered=new JSONArray();for(int i=0;i<dirty.length();i++){JSONObject row=dirty.optJSONObject(i);if(row==null)continue;String id=row.optString("targetType")+":"+norm(row.optString("key"));if(!identity.equals(id))filtered.put(row);}filtered.put(mutation);prefs(c).edit().putString(DIRTY_CONTROLS,filtered.toString()).putString(MUTATION_ID,UUID.randomUUID().toString()).apply();
    }

    static void setLocalSessionIntent(Context c,String targetType,String key,String label){
        String type=targetType==null?"":targetType.trim().toUpperCase(Locale.ROOT),cleanKey=norm(key);JSONObject intent=new JSONObject();try{if(type.isEmpty()||cleanKey.isEmpty()){intent.put("mode","DEFAULT");}else{intent.put("mode","TARGET");intent.put("targetType",type);intent.put("key",cleanKey);intent.put("label",label==null?key:label);}intent.put("source","ANDROID");intent.put("updatedAt",now());JSONObject state=snapshot(c);state.put("sessionIntent",intent);state.put("updatedAt",now());saveSnapshot(c,state);}catch(Exception e){throw new IllegalStateException("无法更新本次推荐意图",e);}prefs(c).edit().putString(DIRTY_SESSION,intent.toString()).putString(MUTATION_ID,UUID.randomUUID().toString()).apply();
    }

    static void clearLocalSessionIntent(Context c){setLocalSessionIntent(c,"","","");}

    static void suppress(Context c,String comicId,boolean value){
        String id=comicId==null?"":comicId.trim();if(id.isEmpty())return;JSONObject state=snapshot(c);LinkedHashSet<String> local=new LinkedHashSet<>();JSONArray existing=state.optJSONArray("hardSuppressComicIds");if(existing!=null)for(int i=0;i<existing.length();i++){String valueId=existing.optString(i,"").trim();if(!valueId.isEmpty())local.add(valueId);}if(value)local.add(id);else local.remove(id);try{state.put("hardSuppressComicIds",new JSONArray(local));state.put("updatedAt",now());}catch(Exception e){throw new IllegalStateException("无法更新本机屏蔽状态",e);}saveSnapshot(c,state);
        String addKey=value?DIRTY_SUPPRESS:DIRTY_CLEAR_SUPPRESS,removeKey=value?DIRTY_CLEAR_SUPPRESS:DIRTY_SUPPRESS;LinkedHashSet<String> add=new LinkedHashSet<>(),remove=new LinkedHashSet<>();JSONArray a=parseArray(prefs(c).getString(addKey,"[]")),r=parseArray(prefs(c).getString(removeKey,"[]"));for(int i=0;i<a.length();i++)add.add(a.optString(i));for(int i=0;i<r.length();i++)remove.add(r.optString(i));add.add(id);remove.remove(id);prefs(c).edit().putString(addKey,new JSONArray(add).toString()).putString(removeKey,new JSONArray(remove).toString()).putString(MUTATION_ID,UUID.randomUUID().toString()).apply();
    }

    static JSONObject syncPayload(Context c){JSONObject body=new JSONObject();try{body.put("deviceId",DeviceIdentity.id(c));String mutation=prefs(c).getString(MUTATION_ID,"");if(mutation==null||mutation.isEmpty())mutation=UUID.randomUUID().toString();body.put("mutationId",mutation);body.put("controls",parseArray(prefs(c).getString(DIRTY_CONTROLS,"[]")));String session=prefs(c).getString(DIRTY_SESSION,"");if(session!=null&&!session.isEmpty())body.put("sessionIntent",parseObject(session));body.put("feedback",RecommendationFeedbackStore.dirtyPayload(c));body.put("suppressComicIds",parseArray(prefs(c).getString(DIRTY_SUPPRESS,"[]")));body.put("clearSuppressComicIds",parseArray(prefs(c).getString(DIRTY_CLEAR_SUPPRESS,"[]")));}catch(Exception e){throw new IllegalStateException("无法生成推荐同步载荷",e);}return body;}

    static void acknowledge(Context c,JSONObject response,String expectedMutationId){String acknowledged=response==null?"":response.optString("acknowledgedMutationId","");if(expectedMutationId!=null&&!expectedMutationId.isEmpty()&&!expectedMutationId.equals(acknowledged))throw new IllegalStateException("电脑未确认本次推荐同步");JSONObject value=response==null?null:response.optJSONObject("snapshot");if(value!=null)saveSnapshot(c,value);prefs(c).edit().remove(DIRTY_CONTROLS).remove(DIRTY_SESSION).remove(DIRTY_SUPPRESS).remove(DIRTY_CLEAR_SUPPRESS).remove(MUTATION_ID).apply();RecommendationFeedbackStore.clearDirty(c);}
    static void acknowledge(Context c,JSONObject response){acknowledge(c,response,response==null?"":response.optString("acknowledgedMutationId",""));}
}
