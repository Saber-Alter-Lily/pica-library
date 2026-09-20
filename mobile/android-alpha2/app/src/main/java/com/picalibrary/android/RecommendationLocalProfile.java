package com.picalibrary.android;

import android.content.Context;
import java.util.*;
import org.json.*;

/** Merges the synced Desktop lifetime baseline with Android's own current favorites. */
final class RecommendationLocalProfile {
    private static final class Signal {
        String targetType,key,label,facet;
        final Set<String> ids=new LinkedHashSet<>();
        Signal(String targetType,String key,String label,String facet){
            this.targetType=targetType;this.key=key;this.label=label;this.facet=facet;
        }
    }

    private RecommendationLocalProfile(){}

    private static String norm(String value){
        return MobileTagRegistry.normalize(value==null?"":value);
    }
    private static String id(String type,String key){return type+":"+norm(key);}

    private static int baseline(int count,double share){
        int n=Math.max(0,count);double s=Math.max(0d,Math.min(1d,share));
        if(n<=0)return 1;
        double countStrength=1d-Math.exp(-n/12d);
        double shareStrength=Math.sqrt(Math.min(1d,s/0.12d));
        double combined=0.75d*countStrength+0.25d*shareStrength;
        return Math.max(1,Math.min(10,(int)Math.round(1d+9d*combined)));
    }

    static JSONArray inferred(Context context){
        Context app=context.getApplicationContext();
        return inferred(app,UnifiedCatalogStore.load(app),RecommendationPolicyStore.snapshot(app));
    }

    static JSONArray inferred(Context context,UnifiedCatalogStore.Snapshot catalog,JSONObject remoteSnapshot){
        Context app=context.getApplicationContext();
        LinkedHashMap<String,JSONObject> merged=new LinkedHashMap<>();
        if(catalog==null)catalog=new UnifiedCatalogStore.Snapshot();
        if(remoteSnapshot==null)remoteSnapshot=new JSONObject();
        JSONObject remoteCounts=remoteSnapshot.optJSONObject("counts");
        int remoteFavorites=remoteCounts==null?0:remoteCounts.optInt("favorites",0),localFavorites=0;
        for(UnifiedCatalogStore.Entry entry:catalog.entries())if(entry.favorite)localFavorites++;
        boolean localLifetimeAuthoritative=localFavorites>0&&(remoteFavorites<=0||localFavorites>=Math.ceil(remoteFavorites*0.90d));
        if(!localLifetimeAuthoritative){
            JSONArray remote=remoteSnapshot.optJSONArray("inferred");
            if(remote==null)remote=new JSONArray();
            for(int i=0;i<remote.length();i++){
                JSONObject row=remote.optJSONObject(i);if(row==null)continue;
                String type=row.optString("targetType","TAG"),key=row.optString("key","");
                if(!key.isEmpty())try{merged.put(id(type,key),new JSONObject(row.toString()));}catch(Exception ignored){}
            }
        }

        List<UnifiedCatalogStore.Entry> positives=new ArrayList<>();
        for(UnifiedCatalogStore.Entry entry:catalog.entries())
            if((entry.favorite||RecommendationFeedbackStore.isLiked(app,entry.id))&&!RecommendationPolicyStore.tasteExcluded(remoteSnapshot,entry.id))positives.add(entry);
        if(positives.isEmpty())return new JSONArray(merged.values());

        MobileTagRegistry registry=null;try{registry=MobileTagRegistry.load(app);}catch(Exception ignored){}
        LinkedHashMap<String,Signal> local=new LinkedHashMap<>();
        for(UnifiedCatalogStore.Entry entry:positives){
            add(local,"AUTHOR",entry.displayAuthor(),entry.displayAuthor(),"CREATOR_ENTITY",entry.id);
            for(String category:entry.categories)add(local,"CATEGORY",category,category,"CATEGORY",entry.id);
            for(String raw:entry.tags){
                String type="TAG",key=raw,label=raw,facet="RAW_TAG";
                if(registry!=null){
                    MobileTagRegistry.Resolved resolved=registry.resolve(raw);
                    if(resolved.safetyBlocked())continue;
                    if(resolved.resolved){
                        if(!resolved.canonicalKey.isEmpty())key=resolved.canonicalKey;
                        if(!resolved.canonicalLabel.isEmpty())label=resolved.canonicalLabel;
                        if(!resolved.facet.isEmpty())facet=resolved.facet;
                        if("FANDOM_IP".equals(resolved.facet))type="FANDOM";
                    }
                }
                add(local,type,key,label,facet,entry.id);
            }
        }

        int total=Math.max(1,positives.size());
        for(Signal signal:local.values()){
            int support=signal.ids.size();double share=(double)support/(double)total;
            JSONObject prior=merged.get(id(signal.targetType,signal.key));
            if(!localLifetimeAuthoritative&&prior!=null&&prior.optInt("supportCount",0)>support)continue;
            JSONObject row=new JSONObject();
            try{
                row.put("targetType",signal.targetType);
                row.put("key",signal.key);
                row.put("label",signal.label);
                row.put("facet",signal.facet);
                row.put("supportCount",support);
                row.put("supportShare",share);
                row.put("baselineLevel",baseline(support,share));
                row.put("localDerived",true);
                merged.put(id(signal.targetType,signal.key),row);
            }catch(Exception ignored){}
        }

        JSONArray controls=remoteSnapshot.optJSONArray("controls");if(controls==null)controls=new JSONArray();
        for(int i=0;i<controls.length();i++){
            JSONObject control=controls.optJSONObject(i);if(control==null)continue;
            String type=control.optString("targetType","TAG"),key=control.optString("key",""),identity=id(type,key);
            if(key.isEmpty()||merged.containsKey(identity))continue;
            JSONObject row=new JSONObject();
            try{
                row.put("targetType",type);row.put("key",key);row.put("label",control.optString("label",key));
                row.put("facet","AUTHOR".equals(type)?"CREATOR_ENTITY":"CATEGORY".equals(type)?"CATEGORY":"FANDOM".equals(type)?"FANDOM_IP":"STYLE_FAMILY".equals(type)?"VISUAL_STYLE":"RAW_TAG");
                row.put("supportCount",0);row.put("supportShare",0);row.put("baselineLevel",5);row.put("manual",true);row.put("systemUnknown",true);
                merged.put(identity,row);
            }catch(Exception ignored){}
        }

        List<JSONObject> rows=new ArrayList<>(merged.values());
        rows.sort((a,b)->{
            int support=Integer.compare(b.optInt("supportCount",0),a.optInt("supportCount",0));
            if(support!=0)return support;
            return a.optString("label","").compareToIgnoreCase(b.optString("label",""));
        });
        JSONArray out=new JSONArray();for(JSONObject row:rows)out.put(row);return out;
    }

    private static void add(
        Map<String,Signal> map,String type,String key,String label,String facet,String comicId
    ){
        String clean=norm(key);if(clean.isEmpty())return;
        String identity=id(type,clean);
        Signal row=map.get(identity);
        if(row==null){row=new Signal(type,clean,label==null||label.trim().isEmpty()?clean:label.trim(),facet);map.put(identity,row);}
        row.ids.add(comicId);
    }
}
