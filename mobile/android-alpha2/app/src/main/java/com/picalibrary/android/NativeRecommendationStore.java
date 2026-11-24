package com.picalibrary.android;

import android.content.Context;
import android.util.AtomicFile;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.*;
import org.json.*;

/** Persistent mobile cache for native fallback or Desktop-authored portable recommendation batches. */
final class NativeRecommendationStore {
    static final String MODEL_VERSION="native-v3.1-frozen-neutral-compatible";
    static final class Item {
        final String comicId,title,author,reason,family,primaryIntentId;String confirmedWorkId="";final double score;final List<String> tags,categories;
        Item(String comicId,String title,String author,String reason,String family,String primaryIntentId,double score){this(comicId,title,author,reason,family,primaryIntentId,score,Collections.emptyList(),Collections.emptyList());}
        Item(String comicId,String title,String author,String reason,String family,String primaryIntentId,double score,Collection<String> tags,Collection<String> categories){this.comicId=comicId;this.title=title;this.author=author;this.reason=reason;this.family=family;this.primaryIntentId=primaryIntentId;this.score=score;this.tags=copy(tags);this.categories=copy(categories);}
        private static List<String> copy(Collection<String> values){LinkedHashSet<String> out=new LinkedHashSet<>();if(values!=null)for(String value:values){String clean=value==null?"":value.trim();if(!clean.isEmpty())out.add(clean);}return new ArrayList<>(out);}
    }
    static final class Snapshot {
        String cycleId="",generatedAt="",favoriteFingerprint="",registryFingerprint="",readiness="";int favoriteCount,candidateCount,batchIndex;
        int readerOrdinal; String consumedTarget=""; final List<String> focusHistory=new ArrayList<>();
        final Map<String,Integer> creatorQueries=new HashMap<>();
        final List<List<Item>> batches=new ArrayList<>();final LinkedHashSet<String> displayedIds=new LinkedHashSet<>(),cooldownIds=new LinkedHashSet<>();
        boolean available(){return !batches.isEmpty()&&batchIndex>=0&&batchIndex<batches.size();}
        List<Item> current(){return available()?batches.get(batchIndex):Collections.emptyList();}
    }
    static Item withWork(String verified,Item item){item.confirmedWorkId=verified==null?"":verified;return item;}
    private NativeRecommendationStore(){}
    private static File file(Context c){return MobileStoragePaths.dataFile(c,"native-recommendation-v3.json");}
    private static List<String> strings(JSONArray arr){List<String> out=new ArrayList<>();if(arr!=null)for(int i=0;i<arr.length();i++){String value=arr.optString(i,"").trim();if(!value.isEmpty()&&!out.contains(value))out.add(value);}return out;}

    static synchronized Snapshot load(Context context){
        Snapshot s=new Snapshot();File f=file(context);AtomicFile atomic=new AtomicFile(f);
        try(InputStream in=atomic.openRead();ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] b=new byte[16384];int n;while((n=in.read(b))>0)out.write(b,0,n);JSONObject root=new JSONObject(out.toString("UTF-8"));s.cycleId=root.optString("cycleId","");s.readerOrdinal=root.optInt("readerOrdinal",0);JSONObject q=root.optJSONObject("readerCreatorQueries");if(q!=null)for(Iterator<String> it=q.keys();it.hasNext();){String k=it.next();s.creatorQueries.put(k,q.optInt(k));}s.consumedTarget=root.optString("consumedTarget","");JSONArray h=root.optJSONArray("readerFocus");if(h!=null)for(int hi=0;hi<h.length();hi++)s.focusHistory.add(h.optString(hi));s.generatedAt=root.optString("generatedAt","");s.favoriteFingerprint=root.optString("favoriteFingerprint","");s.registryFingerprint=root.optString("registryFingerprint","");s.readiness=root.optString("readiness","");s.favoriteCount=root.optInt("favoriteCount",0);s.candidateCount=root.optInt("candidateCount",0);s.batchIndex=Math.max(0,root.optInt("batchIndex",0));readSet(root.optJSONArray("displayedIds"),s.displayedIds);readSet(root.optJSONArray("cooldownIds"),s.cooldownIds);JSONArray batches=root.optJSONArray("batches");if(batches!=null)for(int i=0;i<batches.length();i++){JSONArray arr=batches.optJSONArray(i);List<Item> batch=new ArrayList<>();if(arr!=null)for(int j=0;j<arr.length();j++){JSONObject o=arr.optJSONObject(j);if(o!=null&&!o.optString("comicId","").isEmpty())batch.add(withWork(o.optString("confirmedWorkId",""),new Item(o.optString("comicId"),o.optString("title","未命名漫画"),o.optString("author","未知作者"),o.optString("reason","为你推荐"),o.optString("family",""),o.optString("primaryIntentId",""),o.optDouble("score",0),strings(o.optJSONArray("tags")),strings(o.optJSONArray("categories")))));}if(!batch.isEmpty())s.batches.add(batch);}if(s.batchIndex>=s.batches.size())s.batchIndex=0;return s;}catch(Exception e){return new Snapshot();}
    }

    static synchronized void save(Context context,Snapshot s){
        try{if(s.generatedAt.isEmpty())s.generatedAt=Instant.now().toString();JSONObject root=new JSONObject();root.put("schemaVersion",3);root.put("readerOrdinal",s.readerOrdinal);root.put("consumedTarget",s.consumedTarget);root.put("readerFocus",new JSONArray(s.focusHistory));root.put("readerCreatorQueries",new JSONObject(s.creatorQueries));root.put("modelVersion",MODEL_VERSION);root.put("cycleId",s.cycleId);root.put("generatedAt",s.generatedAt);root.put("favoriteFingerprint",s.favoriteFingerprint);root.put("registryFingerprint",s.registryFingerprint);root.put("readiness",s.readiness);root.put("favoriteCount",s.favoriteCount);root.put("candidateCount",s.candidateCount);root.put("batchIndex",s.batchIndex);root.put("displayedIds",new JSONArray(s.displayedIds));root.put("cooldownIds",new JSONArray(s.cooldownIds));JSONArray batches=new JSONArray();for(List<Item> batch:s.batches){JSONArray arr=new JSONArray();for(Item item:batch){JSONObject o=new JSONObject();o.put("comicId",item.comicId);if(!item.confirmedWorkId.isEmpty())o.put("confirmedWorkId",item.confirmedWorkId);o.put("title",item.title);o.put("author",item.author);o.put("reason",item.reason);o.put("family",item.family);o.put("primaryIntentId",item.primaryIntentId);o.put("score",item.score);o.put("tags",new JSONArray(item.tags));o.put("categories",new JSONArray(item.categories));arr.put(o);}batches.put(arr);}root.put("batches",batches);File target=file(context);target.getParentFile().mkdirs();AtomicFile atomic=new AtomicFile(target);FileOutputStream out=null;try{out=atomic.startWrite();out.write(root.toString().getBytes(StandardCharsets.UTF_8));atomic.finishWrite(out);}catch(Exception ex){if(out!=null)atomic.failWrite(out);throw ex;}}catch(Exception e){throw new IllegalStateException("无法保存手机推荐周期",e);}
    }

    private static Snapshot moveBatch(Context context,int delta){Snapshot s=load(context);if(s.batches.isEmpty())return s;s.batchIndex=Math.floorMod(s.batchIndex+delta,s.batches.size());save(context,s);return s;}
    static synchronized Snapshot nextBatch(Context context){return moveBatch(context,1);}
    static synchronized Snapshot previousBatch(Context context){return moveBatch(context,-1);}
    static synchronized void acknowledgePage(Context context,Snapshot rendered,List<Item> items){
        if(rendered==null||rendered.cycleId.isEmpty()||items.isEmpty()||items.size()>12)return;
        Snapshot current=load(context);boolean same=current.cycleId.equals(rendered.cycleId);
        ReaderRoundLedger.get(context).presented(rendered.readerOrdinal,items);
        if(!same)return;
        boolean changed=false;for(Item item:items)if(current.displayedIds.add(item.comicId)){
            RecommendationEvidenceStore.recordImpression(context,item);changed=true;
        }
        if(changed)save(context,current);
    }
    static boolean favoriteFingerprintMatches(Snapshot snapshot,String fingerprint){return snapshot!=null&&snapshot.available()&&fingerprint!=null&&!fingerprint.isEmpty()&&fingerprint.equals(snapshot.favoriteFingerprint);}
    static synchronized void markFavoriteChange(Context context){Snapshot current=load(context);if(!current.available())return;current.readiness="STALE_FAVORITES";save(context,current);}
    static synchronized void invalidateIfFavoriteFingerprintChanged(Context context,String fingerprint){Snapshot current=load(context);if(favoriteFingerprintMatches(current,fingerprint))return;markFavoriteChange(context);}
    static synchronized void invalidateForFavoriteChange(Context context){Snapshot old=load(context);if(old.readerOrdinal>0){old.readiness="STALE_FAVORITES";save(context,old);return;}old.cooldownIds.addAll(old.displayedIds);old.batches.clear();old.batchIndex=0;old.cycleId="";old.favoriteFingerprint="";old.readiness="STALE_FAVORITES";old.generatedAt=Instant.now().toString();save(context,old);}
    private static void readSet(JSONArray arr,Set<String> out){if(arr==null)return;for(int i=0;i<arr.length();i++){String value=arr.optString(i,"");if(!value.isEmpty())out.add(value);}}
}
