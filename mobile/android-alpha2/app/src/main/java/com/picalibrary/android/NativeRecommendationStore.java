package com.picalibrary.android;

import android.content.Context;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.*;
import org.json.*;

/** Persistent mobile-native Recommendation V3 cycle and displayed-batch history. */
final class NativeRecommendationStore {
    static final String MODEL_VERSION="native-v3.1-frozen-neutral-compatible";
    static final class Item {
        final String comicId,title,author,reason,family,primaryIntentId;final double score;
        Item(String comicId,String title,String author,String reason,String family,String primaryIntentId,double score){this.comicId=comicId;this.title=title;this.author=author;this.reason=reason;this.family=family;this.primaryIntentId=primaryIntentId;this.score=score;}
    }
    static final class Snapshot {
        String cycleId="",generatedAt="",favoriteFingerprint="",registryFingerprint="",readiness="";int favoriteCount,candidateCount,batchIndex;
        final List<List<Item>> batches=new ArrayList<>();final LinkedHashSet<String> displayedIds=new LinkedHashSet<>(),cooldownIds=new LinkedHashSet<>();
        boolean available(){return !batches.isEmpty()&&batchIndex>=0&&batchIndex<batches.size();}
        List<Item> current(){return available()?batches.get(batchIndex):Collections.emptyList();}
    }
    private NativeRecommendationStore(){}
    private static File file(Context c){return MobileStoragePaths.dataFile(c,"native-recommendation-v3.json");}

    static synchronized Snapshot load(Context context){
        Snapshot s=new Snapshot();File f=file(context);if(!f.isFile())return s;
        try(InputStream in=new FileInputStream(f);ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] b=new byte[16384];int n;while((n=in.read(b))>0)out.write(b,0,n);JSONObject root=new JSONObject(out.toString("UTF-8"));s.cycleId=root.optString("cycleId","");s.generatedAt=root.optString("generatedAt","");s.favoriteFingerprint=root.optString("favoriteFingerprint","");s.registryFingerprint=root.optString("registryFingerprint","");s.readiness=root.optString("readiness","");s.favoriteCount=root.optInt("favoriteCount",0);s.candidateCount=root.optInt("candidateCount",0);s.batchIndex=Math.max(0,root.optInt("batchIndex",0));readSet(root.optJSONArray("displayedIds"),s.displayedIds);readSet(root.optJSONArray("cooldownIds"),s.cooldownIds);JSONArray batches=root.optJSONArray("batches");if(batches!=null)for(int i=0;i<batches.length();i++){JSONArray arr=batches.optJSONArray(i);List<Item> batch=new ArrayList<>();if(arr!=null)for(int j=0;j<arr.length();j++){JSONObject o=arr.optJSONObject(j);if(o!=null&&!o.optString("comicId","").isEmpty())batch.add(new Item(o.optString("comicId"),o.optString("title","未命名漫画"),o.optString("author","未知作者"),o.optString("reason","为你推荐"),o.optString("family",""),o.optString("primaryIntentId",""),o.optDouble("score",0)));}if(!batch.isEmpty())s.batches.add(batch);}if(s.batchIndex>=s.batches.size())s.batchIndex=0;return s;}catch(Exception e){return new Snapshot();}
    }

    static synchronized void save(Context context,Snapshot s){
        try{if(s.generatedAt.isEmpty())s.generatedAt=Instant.now().toString();JSONObject root=new JSONObject();root.put("schemaVersion",1);root.put("modelVersion",MODEL_VERSION);root.put("cycleId",s.cycleId);root.put("generatedAt",s.generatedAt);root.put("favoriteFingerprint",s.favoriteFingerprint);root.put("registryFingerprint",s.registryFingerprint);root.put("readiness",s.readiness);root.put("favoriteCount",s.favoriteCount);root.put("candidateCount",s.candidateCount);root.put("batchIndex",s.batchIndex);root.put("displayedIds",new JSONArray(s.displayedIds));root.put("cooldownIds",new JSONArray(s.cooldownIds));JSONArray batches=new JSONArray();for(List<Item> batch:s.batches){JSONArray arr=new JSONArray();for(Item item:batch){JSONObject o=new JSONObject();o.put("comicId",item.comicId);o.put("title",item.title);o.put("author",item.author);o.put("reason",item.reason);o.put("family",item.family);o.put("primaryIntentId",item.primaryIntentId);o.put("score",item.score);arr.put(o);}batches.put(arr);}root.put("batches",batches);File target=file(context);target.getParentFile().mkdirs();File tmp=new File(target.getParentFile(),target.getName()+".tmp");try(OutputStream out=new FileOutputStream(tmp)){out.write(root.toString().getBytes(StandardCharsets.UTF_8));}if(target.exists()&&!target.delete())throw new IOException("replace native recommendation failed");if(!tmp.renameTo(target))throw new IOException("rename native recommendation failed");}catch(Exception e){throw new IllegalStateException("无法保存手机推荐周期",e);}
    }

    static synchronized Snapshot nextBatch(Context context){Snapshot s=load(context);if(s.batches.isEmpty())return s;markCurrent(s);s.batchIndex=(s.batchIndex+1)%s.batches.size();save(context,s);return s;}
    static synchronized Snapshot previousBatch(Context context){Snapshot s=load(context);if(s.batches.isEmpty())return s;markCurrent(s);s.batchIndex=(s.batchIndex-1+s.batches.size())%s.batches.size();save(context,s);return s;}
    static synchronized void markCurrentSeen(Context context){Snapshot s=load(context);if(!s.available())return;markCurrent(s);save(context,s);}
    static boolean favoriteFingerprintMatches(Snapshot snapshot,String fingerprint){return snapshot!=null&&snapshot.available()&&fingerprint!=null&&!fingerprint.isEmpty()&&fingerprint.equals(snapshot.favoriteFingerprint);}
    static synchronized void markFavoriteChange(Context context){Snapshot current=load(context);if(!current.available())return;markCurrent(current);current.readiness="STALE_FAVORITES";save(context,current);}
    static synchronized void invalidateIfFavoriteFingerprintChanged(Context context,String fingerprint){Snapshot current=load(context);if(favoriteFingerprintMatches(current,fingerprint))return;markFavoriteChange(context);}
    static synchronized void invalidateForFavoriteChange(Context context){Snapshot old=load(context);markCurrent(old);old.cooldownIds.addAll(old.displayedIds);old.batches.clear();old.batchIndex=0;old.cycleId="";old.favoriteFingerprint="";old.readiness="STALE_FAVORITES";old.generatedAt=Instant.now().toString();save(context,old);}
    static LinkedHashSet<String> cooldownForNextCycle(Context context){Snapshot old=load(context);LinkedHashSet<String> out=new LinkedHashSet<>(old.cooldownIds);out.addAll(old.displayedIds);while(out.size()>NativeRecommendationPolicy.BATCH_SIZE*NativeRecommendationPolicy.MAX_BATCHES*2){Iterator<String> it=out.iterator();if(it.hasNext()){it.next();it.remove();}else break;}return out;}
    private static void markCurrent(Snapshot s){if(!s.available())return;for(Item item:s.current())s.displayedIds.add(item.comicId);}
    private static void readSet(JSONArray arr,Set<String> out){if(arr==null)return;for(int i=0;i<arr.length();i++){String value=arr.optString(i,"");if(!value.isEmpty())out.add(value);}}
}
