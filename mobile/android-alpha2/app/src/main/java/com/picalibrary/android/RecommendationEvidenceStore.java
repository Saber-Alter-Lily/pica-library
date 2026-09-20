package com.picalibrary.android;

import android.content.Context;
import android.content.SharedPreferences;
import java.time.Instant;
import java.time.Duration;
import java.util.*;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Bounded Android-local recommendation evidence.
 * Runtime session state stays local; selected durable/recent events can be
 * synced later without syncing the current recommendation batch.
 */
final class RecommendationEvidenceStore {
    static final class Signal {
        final String kind,label;final int score,support;
        Signal(String kind,String label,int score,int support){this.kind=kind;this.label=label;this.score=score;this.support=support;}
    }
    private static final String PREFS="recommendation-evidence-v1";
    private static final String EVENTS="events";
    private static final int MAX_EVENTS=1000;
    private static final String PROCESS_SESSION_ID=UUID.randomUUID().toString();
    private static String cachedRaw=null;
    private static JSONArray cachedEvents=null;
    private static List<EvidenceRow> cachedRows=null;

    private static final class EvidenceRow {
        final String eventType,comicId,author,sessionId;
        final List<String> tags,categories;
        final Set<String> normalizedTags,normalizedCategories;
        final long occurredAtMillis;
        EvidenceRow(String eventType,String comicId,String author,List<String> tags,List<String> categories,String sessionId,long occurredAtMillis){
            this.eventType=eventType;this.comicId=comicId;this.author=author;this.tags=tags;this.categories=categories;this.sessionId=sessionId;this.occurredAtMillis=occurredAtMillis;
            normalizedTags=normalized(tags);normalizedCategories=normalized(categories);
        }
    }

    private RecommendationEvidenceStore(){}

    private static SharedPreferences prefs(Context c){
        return c.getApplicationContext().getSharedPreferences(PREFS,Context.MODE_PRIVATE);
    }
    private static synchronized JSONArray load(Context c){
        String raw=prefs(c).getString(EVENTS,"[]");
        if(raw==null)raw="[]";
        if(cachedEvents!=null&&raw.equals(cachedRaw))return cachedEvents;
        cachedRows=null;
        try{cachedEvents=new JSONArray(raw);cachedRaw=raw;return cachedEvents;}
        catch(Exception e){cachedEvents=new JSONArray();cachedRaw="[]";return cachedEvents;}
    }
    private static synchronized void save(Context c,JSONArray value){
        String raw=(value==null?new JSONArray():value).toString();
        cachedRaw=raw;cachedEvents=value==null?new JSONArray():value;cachedRows=null;
        prefs(c).edit().putString(EVENTS,raw).apply();
    }
    private static JSONArray strings(Collection<String> values){
        JSONArray out=new JSONArray();LinkedHashSet<String> unique=new LinkedHashSet<>();
        if(values!=null)for(String value:values){String clean=value==null?"":value.trim();if(!clean.isEmpty())unique.add(clean);}
        for(String value:unique)out.put(value);return out;
    }
    private static List<String> strings(JSONArray arr){
        ArrayList<String> out=new ArrayList<>();if(arr!=null)for(int i=0;i<arr.length();i++){String value=arr.optString(i,"").trim();if(!value.isEmpty()&&!out.contains(value))out.add(value);}return out;
    }

    static synchronized void record(
        Context c,String eventType,String comicId,String author,
        Collection<String> tags,Collection<String> categories
    ){
        String type=eventType==null?"":eventType.trim();
        if(!Arrays.asList("recommend_impression","recommend_detail_open","reader_complete").contains(type))return;
        String id=comicId==null?"":comicId.trim();if(id.isEmpty())return;
        JSONObject row=new JSONObject();
        try{
            row.put("eventId",UUID.randomUUID().toString());
            row.put("eventType",type);
            row.put("comicId",id);
            row.put("author",author==null?"":author.trim());
            row.put("tags",strings(tags));
            row.put("categories",strings(categories));
            row.put("occurredAt",Instant.now().toString());
            row.put("sessionId",PROCESS_SESSION_ID);
            row.put("dirty",true);
        }catch(Exception ignored){return;}
        JSONArray existing=load(c),next=new JSONArray();
        int start=Math.max(0,existing.length()-(MAX_EVENTS-1));
        for(int i=start;i<existing.length();i++){JSONObject value=existing.optJSONObject(i);if(value!=null)next.put(value);}
        next.put(row);save(c,next);
    }

    static void recordImpression(Context c,NativeRecommendationStore.Item item){
        if(item!=null)record(c,"recommend_impression",item.comicId,item.author,item.tags,item.categories);
    }
    static void recordDetailOpen(Context c,String comicId,String author,Collection<String> tags,Collection<String> categories){
        record(c,"recommend_detail_open",comicId,author,tags,categories);
    }
    static void recordReaderComplete(Context c,String comicId,String author,Collection<String> tags,Collection<String> categories){
        record(c,"reader_complete",comicId,author,tags,categories);
    }

    static synchronized void importSynced(Context c,JSONArray rows){
        if(rows==null||rows.length()==0)return;
        JSONArray existing=load(c);LinkedHashSet<String> known=new LinkedHashSet<>();
        ArrayList<JSONObject> values=new ArrayList<>();
        for(int i=0;i<existing.length();i++){JSONObject row=existing.optJSONObject(i);if(row==null)continue;values.add(row);String eventId=row.optString("eventId","");if(!eventId.isEmpty())known.add(eventId);}
        for(int i=0;i<rows.length();i++){
            JSONObject raw=rows.optJSONObject(i);if(raw==null)continue;
            String eventId=raw.optString("eventId","").trim(),type=raw.optString("eventType","").trim(),comicId=raw.optString("comicId","").trim();
            if(eventId.isEmpty()||known.contains(eventId)||comicId.isEmpty()||!Arrays.asList("recommend_impression","recommend_detail_open","reader_complete").contains(type))continue;
            JSONObject row=new JSONObject();
            try{
                row.put("eventId",eventId);row.put("eventType",type);row.put("comicId",comicId);
                row.put("author",raw.optString("author",""));row.put("tags",raw.optJSONArray("tags")==null?new JSONArray():raw.optJSONArray("tags"));
                row.put("categories",raw.optJSONArray("categories")==null?new JSONArray():raw.optJSONArray("categories"));
                row.put("occurredAt",raw.optString("occurredAt",""));row.put("sessionId","DESKTOP_SYNC");row.put("dirty",false);
                values.add(row);known.add(eventId);
            }catch(Exception ignored){}
        }
        values.sort((a,b)->a.optString("occurredAt","").compareTo(b.optString("occurredAt","")));
        JSONArray next=new JSONArray();int start=Math.max(0,values.size()-MAX_EVENTS);for(int i=start;i<values.size();i++)next.put(values.get(i));save(c,next);
    }

    static synchronized JSONArray dirtyPayload(Context c){
        JSONArray out=new JSONArray(),events=load(c);
        for(int i=0;i<events.length();i++){
            JSONObject row=events.optJSONObject(i);if(row==null||!row.optBoolean("dirty",false))continue;
            JSONObject wire=new JSONObject();
            try{
                wire.put("eventId",row.optString("eventId",""));
                wire.put("eventType",row.optString("eventType",""));
                wire.put("comicId",row.optString("comicId",""));
                wire.put("occurredAt",row.optString("occurredAt",""));
                out.put(wire);
            }catch(Exception ignored){}
        }
        return out;
    }

    static synchronized void clearDirty(Context c){
        JSONArray events=load(c);
        for(int i=0;i<events.length();i++){
            JSONObject row=events.optJSONObject(i);
            if(row!=null)try{row.put("dirty",false);}catch(Exception ignored){}
        }
        save(c,events);
    }

    private static Set<String> normalized(Collection<String> values){
        LinkedHashSet<String> out=new LinkedHashSet<>();if(values!=null)for(String value:values){String key=MobileTagRegistry.normalize(value);if(!key.isEmpty())out.add(key);}return out;
    }
    private static long parseMillis(String stamp){try{return Instant.parse(stamp==null?"":stamp).toEpochMilli();}catch(Exception e){return Long.MIN_VALUE;}}
    private static synchronized List<EvidenceRow> rows(Context c){
        if(cachedRows!=null)return cachedRows;
        JSONArray events=load(c);ArrayList<EvidenceRow> out=new ArrayList<>();
        for(int i=0;i<events.length();i++){
            JSONObject row=events.optJSONObject(i);if(row==null)continue;
            out.add(new EvidenceRow(
                row.optString("eventType",""),
                row.optString("comicId",""),
                row.optString("author",""),
                strings(row.optJSONArray("tags")),
                strings(row.optJSONArray("categories")),
                row.optString("sessionId",""),
                parseMillis(row.optString("occurredAt",""))
            ));
        }
        cachedRows=Collections.unmodifiableList(out);return cachedRows;
    }
    private static long ageMillis(EvidenceRow row,long now){
        return row.occurredAtMillis==Long.MIN_VALUE?Long.MAX_VALUE:Math.max(0L,now-row.occurredAtMillis);
    }
    private static int overlapNormalized(Set<String> left,Set<String> right){
        if(left.isEmpty()||right.isEmpty())return 0;int n=0;Set<String> small=left.size()<=right.size()?left:right,large=small==left?right:left;for(String value:small)if(large.contains(value))n++;return n;
    }

    private static long ageMillis(JSONObject row){
        try{return Math.max(0L,Duration.between(Instant.parse(row.optString("occurredAt","")),Instant.now()).toMillis());}
        catch(Exception e){return Long.MAX_VALUE;}
    }
    private static boolean same(String left,String right){
        return MobileTagRegistry.normalize(left).equals(MobileTagRegistry.normalize(right));
    }
    private static int overlap(List<String> a,List<String> b){
        Set<String> left=new HashSet<>();for(String value:a)left.add(MobileTagRegistry.normalize(value));
        int n=0;for(String value:b)if(left.contains(MobileTagRegistry.normalize(value)))n++;return n;
    }

    static double recentAdjustment(Context c,PicaClient.Comic comic){
        return adjustment(c,comic,false);
    }
    static double sessionAdjustment(Context c,PicaClient.Comic comic){
        return adjustment(c,comic,true);
    }
    private static double adjustment(Context c,PicaClient.Comic comic,boolean sessionOnly){
        if(comic==null)return 0d;double score=0d;long now=System.currentTimeMillis();
        long maxAge=sessionOnly?Long.MAX_VALUE:30L*24L*60L*60L*1000L;
        String author=MobileTagRegistry.normalize(comic.author);Set<String> tags=normalized(comic.tags),categories=normalized(comic.categories);
        for(EvidenceRow row:rows(c)){
            if(sessionOnly&&!PROCESS_SESSION_ID.equals(row.sessionId))continue;
            if(!sessionOnly&&ageMillis(row,now)>maxAge)continue;
            String type=row.eventType;
            if("recommend_impression".equals(type)&&comic.id.equals(row.comicId)){score-=sessionOnly?0.08:0.03;continue;}
            double weight="reader_complete".equals(type)?0.035:"recommend_detail_open".equals(type)?0.018:0d;
            if(weight<=0)continue;
            if(!author.isEmpty()&&author.equals(MobileTagRegistry.normalize(row.author)))score+=weight;
            score+=Math.min(weight,overlapNormalized(tags,row.normalizedTags)*weight*0.25);
            score+=Math.min(weight*0.6,overlapNormalized(categories,row.normalizedCategories)*weight*0.2);
        }
        double cap=sessionOnly?0.15:0.10;return Math.max(-cap,Math.min(cap,score));
    }

    static List<Signal> topSignals(Context c,boolean sessionOnly,int limit){
        LinkedHashMap<String,Integer> score=new LinkedHashMap<>(),support=new LinkedHashMap<>();long max=30L*24L*60L*60L*1000L,now=System.currentTimeMillis();
        for(EvidenceRow row:rows(c)){
            if(sessionOnly&&!PROCESS_SESSION_ID.equals(row.sessionId))continue;
            if(!sessionOnly&&ageMillis(row,now)>max)continue;
            String type=row.eventType;int weight="reader_complete".equals(type)?3:"recommend_detail_open".equals(type)?1:0;if(weight<=0)continue;
            addSignal(score,support,"作者",row.author,weight);
            for(String tag:row.tags)addSignal(score,support,"标签",tag,weight);
            for(String category:row.categories)addSignal(score,support,"分类",category,weight);
        }
        ArrayList<Signal> rows=new ArrayList<>();for(Map.Entry<String,Integer> item:score.entrySet()){String[] parts=item.getKey().split("\u0000",2);if(parts.length==2)rows.add(new Signal(parts[0],parts[1],item.getValue(),support.getOrDefault(item.getKey(),0)));}
        rows.sort((a,b)->{int by=Integer.compare(b.score,a.score);if(by!=0)return by;int sup=Integer.compare(b.support,a.support);return sup!=0?sup:a.label.compareToIgnoreCase(b.label);});
        return rows.subList(0,Math.min(Math.max(0,limit),rows.size()));
    }
    private static void addSignal(Map<String,Integer> score,Map<String,Integer> support,String kind,String label,int weight){
        String clean=label==null?"":label.trim();if(clean.isEmpty())return;String key=kind+"\u0000"+clean;score.put(key,score.getOrDefault(key,0)+weight);support.put(key,support.getOrDefault(key,0)+1);
    }

    static int recentCount(Context c){
        int n=0;long max=30L*24L*60L*60L*1000L,now=System.currentTimeMillis();
        for(EvidenceRow row:rows(c))if(ageMillis(row,now)<=max)n++;
        return n;
    }
    static int sessionCount(Context c){
        int n=0;for(EvidenceRow row:rows(c))if(PROCESS_SESSION_ID.equals(row.sessionId))n++;
        return n;
    }
    static String sessionId(){return PROCESS_SESSION_ID;}
}
