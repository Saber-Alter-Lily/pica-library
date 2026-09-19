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
 * Desktop remains the heavy-compute authority. Android applies only the delta
 * between the policy baked into a cached ranking and current local mutations.
 */
final class RecommendationPolicyStore {
    private static final String PREFS="recommendation-policy-v5";
    private static final String SNAPSHOT="snapshot";
    private static final String CACHE_BASELINE="cacheBaseline";
    private static final String BASE_SNAPSHOT="lastSyncedBaseSnapshot";
    private static final String LOCAL_SESSION="localSessionIntent";
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

    private static JSONObject remoteSnapshot(Context c){return parseObject(prefs(c).getString(SNAPSHOT,"{}"));}
    private static JSONObject localSessionIntent(Context c){String raw=prefs(c).getString(LOCAL_SESSION,"");if(raw==null||raw.isEmpty()){JSONObject value=new JSONObject();try{value.put("mode","DEFAULT");value.put("source","ANDROID");value.put("updatedAt",now());}catch(Exception ignored){}return value;}return parseObject(raw);}
    static JSONObject snapshot(Context c){JSONObject value=parseObject(remoteSnapshot(c).toString());try{value.put("sessionIntent",localSessionIntent(c));}catch(Exception ignored){}return value;}
    static void saveSnapshot(Context c,JSONObject value){if(value==null)return;prefs(c).edit().putString(SNAPSHOT,value.toString()).apply();}
    static void saveSyncedBase(Context c,JSONObject value){if(value==null)return;prefs(c).edit().putString(BASE_SNAPSHOT,value.toString()).apply();}
    static JSONObject syncedBase(Context c){String raw=prefs(c).getString(BASE_SNAPSHOT,"");return raw==null||raw.isEmpty()?new JSONObject():parseObject(raw);}
    static int revision(Context c){return remoteSnapshot(c).optInt("revision",0);}
    static boolean hasPendingPortableChanges(Context c){return parseArray(prefs(c).getString(DIRTY_CONTROLS,"[]")).length()>0||RecommendationFeedbackStore.dirtyPayload(c).length()>0||parseArray(prefs(c).getString(DIRTY_SUPPRESS,"[]")).length()>0||parseArray(prefs(c).getString(DIRTY_CLEAR_SUPPRESS,"[]")).length()>0;}
    static int pendingControlCount(Context c){return parseArray(prefs(c).getString(DIRTY_CONTROLS,"[]")).length();}
    static JSONArray inferred(Context c){JSONArray arr=snapshot(c).optJSONArray("inferred");return arr==null?new JSONArray():arr;}
    static JSONArray controls(Context c){JSONArray arr=snapshot(c).optJSONArray("controls");return arr==null?new JSONArray():arr;}
    static JSONObject cacheBaseline(Context c){String raw=prefs(c).getString(CACHE_BASELINE,"");return raw==null||raw.isEmpty()?snapshot(c):parseObject(raw);}
    static void saveCacheBaseline(Context c,JSONObject value){if(value==null)return;prefs(c).edit().putString(CACHE_BASELINE,value.toString()).apply();}
    static void markCacheBaseline(Context c){saveCacheBaseline(c,snapshot(c));}

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

    /**
     * Cheap offline V5 operation only. Source order is the Android runtime ranking.
     * CACHE_BASELINE is frozen when that runtime cycle is built. Later local or synced
     * policy changes are applied as deltas until Android explicitly builds a new cycle.
     */
    static NativeRecommendationStore.Snapshot applyLocalPolicy(Context c,NativeRecommendationStore.Snapshot source){
        NativeRecommendationStore.Snapshot out=new NativeRecommendationStore.Snapshot();if(source==null)return out;
        out.cycleId=source.cycleId;out.generatedAt=source.generatedAt;out.favoriteFingerprint=source.favoriteFingerprint;out.registryFingerprint=source.registryFingerprint;out.readiness=source.readiness;out.favoriteCount=source.favoriteCount;out.displayedIds.addAll(source.displayedIds);out.cooldownIds.addAll(source.cooldownIds);
        JSONObject current=snapshot(c),baseline=cacheBaseline(c);int sourceCount=0;for(List<NativeRecommendationStore.Item> sourceBatch:source.batches)sourceCount+=sourceBatch.size();
        final class RankedItem{final NativeRecommendationStore.Item item;final double adjusted;final int order;RankedItem(NativeRecommendationStore.Item item,double adjusted,int order){this.item=item;this.adjusted=adjusted;this.order=order;}}
        LinkedHashMap<String,RankedItem> unique=new LinkedHashMap<>();int order=0;for(List<NativeRecommendationStore.Item> sourceBatch:source.batches)for(NativeRecommendationStore.Item item:sourceBatch){if(item==null||item.comicId.isEmpty()){order++;continue;}if(RecommendationFeedbackStore.hasFeedback(c,item.comicId)||blocked(current,item)){order++;continue;}double baked=sourceCount<=1?1d:1d-(double)order/(double)(sourceCount-1);double delta=adjustment(current,item)-adjustment(baseline,item);if(!unique.containsKey(item.comicId))unique.put(item.comicId,new RankedItem(item,baked+delta,order));order++;}
        List<RankedItem> rows=new ArrayList<>(unique.values());rows.sort((a,b)->{int byScore=Double.compare(b.adjusted,a.adjusted);return byScore!=0?byScore:Integer.compare(a.order,b.order);});
        List<NativeRecommendationStore.Item> batch=new ArrayList<>();for(RankedItem row:rows){batch.add(row.item);if(batch.size()>=NativeRecommendationPolicy.BATCH_SIZE){out.batches.add(batch);batch=new ArrayList<>();}}if(!batch.isEmpty())out.batches.add(batch);out.candidateCount=rows.size();out.batchIndex=out.batches.isEmpty()?0:Math.floorMod(source.batchIndex,out.batches.size());return out;
    }

    static void moveVisibleBatch(Context c,int delta){NativeRecommendationStore.Snapshot source=NativeRecommendationStore.load(c),visible=applyLocalPolicy(c,source);int count=visible.batches.size();if(count<=0||delta==0)return;source.batchIndex=Math.floorMod(visible.batchIndex+delta,count);NativeRecommendationStore.save(c,source);}

    static void setLocalControl(Context c,String targetType,String key,String label,String direction,String scope){setLocalControl(c,targetType,key,label,direction,scope,null);}
    static void setLocalControl(Context c,String targetType,String key,String label,String direction,String scope,Integer levelDelta){
        String type=targetType==null?"":targetType.trim().toUpperCase(Locale.ROOT),cleanKey=norm(key),dir=direction==null?"DEFAULT":direction.trim().toUpperCase(Locale.ROOT);if(cleanKey.isEmpty())return;
        JSONObject state=snapshot(c);JSONArray current=state.optJSONArray("controls");if(current==null)current=new JSONArray();JSONArray next=new JSONArray();String identity=type+":"+cleanKey;for(int i=0;i<current.length();i++){JSONObject row=current.optJSONObject(i);if(row==null)continue;String id=row.optString("targetType")+":"+norm(row.optString("key"));if(!identity.equals(id))next.put(row);}
        JSONObject mutation=new JSONObject();try{mutation.put("targetType",type);mutation.put("key",cleanKey);mutation.put("label",label==null?key:label);mutation.put("direction",dir);if(levelDelta!=null&&!"BLOCK".equals(dir))mutation.put("levelDelta",Math.max(-9,Math.min(9,levelDelta.intValue())));mutation.put("scope","SESSION".equals(scope)?"SESSION":"PERSISTENT");mutation.put("source","ANDROID");mutation.put("updatedAt",now());if(!"DEFAULT".equals(dir))next.put(new JSONObject(mutation.toString()));state.put("controls",next);state.put("updatedAt",now());}catch(Exception e){throw new IllegalStateException("无法更新本机推荐偏好",e);}saveSnapshot(c,state);
        JSONArray dirty=parseArray(prefs(c).getString(DIRTY_CONTROLS,"[]"));JSONArray filtered=new JSONArray();for(int i=0;i<dirty.length();i++){JSONObject row=dirty.optJSONObject(i);if(row==null)continue;String id=row.optString("targetType")+":"+norm(row.optString("key"));if(!identity.equals(id))filtered.put(row);}filtered.put(mutation);prefs(c).edit().putString(DIRTY_CONTROLS,filtered.toString()).putString(MUTATION_ID,UUID.randomUUID().toString()).apply();
    }

    static void setLocalSessionIntent(Context c,String targetType,String key,String label){
        String type=targetType==null?"":targetType.trim().toUpperCase(Locale.ROOT),cleanKey=norm(key);JSONObject intent=new JSONObject();try{if(type.isEmpty()||cleanKey.isEmpty()){intent.put("mode","DEFAULT");}else{intent.put("mode","TARGET");intent.put("targetType",type);intent.put("key",cleanKey);intent.put("label",label==null?key:label);}intent.put("source","ANDROID");intent.put("updatedAt",now());}catch(Exception e){throw new IllegalStateException("无法更新本次推荐意图",e);}prefs(c).edit().putString(LOCAL_SESSION,intent.toString()).remove(DIRTY_SESSION).apply();
    }

    static void clearLocalSessionIntent(Context c){setLocalSessionIntent(c,"","","");}

    static void suppress(Context c,String comicId,boolean value){
        String id=comicId==null?"":comicId.trim();if(id.isEmpty())return;JSONObject state=snapshot(c);LinkedHashSet<String> local=new LinkedHashSet<>();JSONArray existing=state.optJSONArray("hardSuppressComicIds");if(existing!=null)for(int i=0;i<existing.length();i++){String valueId=existing.optString(i,"").trim();if(!valueId.isEmpty())local.add(valueId);}if(value)local.add(id);else local.remove(id);try{state.put("hardSuppressComicIds",new JSONArray(local));state.put("updatedAt",now());}catch(Exception e){throw new IllegalStateException("无法更新本机屏蔽状态",e);}saveSnapshot(c,state);
        String addKey=value?DIRTY_SUPPRESS:DIRTY_CLEAR_SUPPRESS,removeKey=value?DIRTY_CLEAR_SUPPRESS:DIRTY_SUPPRESS;LinkedHashSet<String> add=new LinkedHashSet<>(),remove=new LinkedHashSet<>();JSONArray a=parseArray(prefs(c).getString(addKey,"[]")),r=parseArray(prefs(c).getString(removeKey,"[]"));for(int i=0;i<a.length();i++)add.add(a.optString(i));for(int i=0;i<r.length();i++)remove.add(r.optString(i));add.add(id);remove.remove(id);prefs(c).edit().putString(addKey,new JSONArray(add).toString()).putString(removeKey,new JSONArray(remove).toString()).putString(MUTATION_ID,UUID.randomUUID().toString()).apply();
    }

    static JSONObject syncPayload(Context c){JSONObject body=new JSONObject();try{body.put("syncSchemaVersion",1);body.put("deviceId",DeviceIdentity.id(c));String mutation=prefs(c).getString(MUTATION_ID,"");if(mutation==null||mutation.isEmpty())mutation=UUID.randomUUID().toString();body.put("mutationId",mutation);JSONObject base=syncedBase(c);body.put("baseRevision",base.optInt("revision",0));JSONArray baseControls=base.optJSONArray("controls");body.put("baseControls",baseControls==null?new JSONArray():baseControls);body.put("controls",parseArray(prefs(c).getString(DIRTY_CONTROLS,"[]")));body.put("feedback",RecommendationFeedbackStore.dirtyPayload(c));body.put("events",RecommendationEvidenceStore.dirtyPayload(c));body.put("suppressComicIds",parseArray(prefs(c).getString(DIRTY_SUPPRESS,"[]")));body.put("clearSuppressComicIds",parseArray(prefs(c).getString(DIRTY_CLEAR_SUPPRESS,"[]")));}catch(Exception e){throw new IllegalStateException("无法生成推荐同步载荷",e);}return body;}

    static JSONObject previewPayload(Context c){return syncPayload(c);}

    static void seedRemoteSnapshot(Context c,JSONObject value){if(value==null)return;if(!hasPendingPortableChanges(c)){saveSnapshot(c,value);saveSyncedBase(c,value);}}

    static void acknowledge(Context c,JSONObject response,String expectedMutationId){if(response!=null&&response.optBoolean("requiresResolution",false))throw new IllegalStateException("存在需要人工处理的推荐偏好冲突");String acknowledged=response==null?"":response.optString("acknowledgedMutationId","");if(expectedMutationId!=null&&!expectedMutationId.isEmpty()&&!expectedMutationId.equals(acknowledged))throw new IllegalStateException("电脑未确认本次推荐同步");JSONObject value=response==null?null:response.optJSONObject("snapshot");if(value!=null){saveSnapshot(c,value);saveSyncedBase(c,value);}prefs(c).edit().remove(DIRTY_CONTROLS).remove(DIRTY_SESSION).remove(DIRTY_SUPPRESS).remove(DIRTY_CLEAR_SUPPRESS).remove(MUTATION_ID).apply();RecommendationFeedbackStore.clearDirty(c);RecommendationEvidenceStore.clearDirty(c);}
    static void acknowledge(Context c,JSONObject response){acknowledge(c,response,response==null?"":response.optString("acknowledgedMutationId",""));}
}
