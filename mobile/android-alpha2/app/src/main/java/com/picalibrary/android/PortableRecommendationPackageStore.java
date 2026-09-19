package com.picalibrary.android;

import android.content.Context;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.*;
import org.json.*;

/**
 * Desktop-prepared recommendation foundation + candidate reservoir.
 * This is reusable input, never the Android runtime cycle itself.
 */
final class PortableRecommendationPackageStore {
    static final class Candidate {
        final String comicId,providerId,title,author,canonicalAuthor,coverUrl;
        final List<String> tags,categories;
        final int pagesCount,totalLikes,totalViews,desktopPoolRank;
        final boolean visualAvailable;
        final double visualAffinity,visualConfidence;
        final String visualSource;

        Candidate(
            String comicId,String providerId,String title,String author,
            String canonicalAuthor,String coverUrl,List<String> tags,
            List<String> categories,int pagesCount,int totalLikes,int totalViews,
            int desktopPoolRank,boolean visualAvailable,double visualAffinity,
            double visualConfidence,String visualSource
        ){
            this.comicId=comicId;this.providerId=providerId;this.title=title;
            this.author=author;this.canonicalAuthor=canonicalAuthor;
            this.coverUrl=coverUrl;this.tags=tags;this.categories=categories;
            this.pagesCount=pagesCount;this.totalLikes=totalLikes;
            this.totalViews=totalViews;this.desktopPoolRank=desktopPoolRank;
            this.visualAvailable=visualAvailable;this.visualAffinity=visualAffinity;
            this.visualConfidence=visualConfidence;this.visualSource=visualSource;
        }

        PicaClient.Comic asComic(){
            return new PicaClient.Comic(
                comicId,
                title.isEmpty()?comicId:title,
                author,
                "",
                coverUrl,
                "",
                new ArrayList<>(tags),
                new ArrayList<>(categories),
                false,
                false,
                Math.max(0,pagesCount),
                1,
                Math.max(0,totalLikes),
                Math.max(0,totalViews)
            );
        }
    }

    static final class Identity {
        final String comicId,workId,workTitle,editionId,editionLabel,bindingStatus,resolverVersion;
        final double confidence;
        Identity(String comicId,String workId,String workTitle,String editionId,String editionLabel,String bindingStatus,double confidence,String resolverVersion){
            this.comicId=comicId;this.workId=workId;this.workTitle=workTitle;this.editionId=editionId;this.editionLabel=editionLabel;this.bindingStatus=bindingStatus;this.confidence=confidence;this.resolverVersion=resolverVersion;
        }
    }

    static final class Snapshot {
        int schemaVersion=1,policyRevision;
        String generatedAt="",engineVersion="",visualGeneration="",
            canonicalGeneration="",behaviorGeneration="",reservoirGeneration="",sourceCycleId="";
        final List<Candidate> candidates=new ArrayList<>();
        final Map<String,Candidate> candidateById=new LinkedHashMap<>();
        final Map<String,Identity> identityByComic=new LinkedHashMap<>();
        boolean available(){return !reservoirGeneration.isEmpty()&&!candidates.isEmpty();}
        String workId(String comicId){Identity value=identityByComic.get(comicId);return value==null?"":value.workId;}
        int identityBindingCount(){return identityByComic.size();}
        double visualAdjustment(String comicId){
            Candidate row=candidateById.get(comicId);if(row==null||!row.visualAvailable)return 0d;
            double maximum="LOCAL_PAGES".equals(row.visualSource)?0.10:"REMOTE_PAGES".equals(row.visualSource)?0.08:0.03;
            double centered=(Math.max(0d,Math.min(1d,row.visualAffinity))-0.5d)*2d;
            return centered*maximum*Math.max(0d,Math.min(1d,row.visualConfidence));
        }
    }

    private PortableRecommendationPackageStore(){}

    private static File file(Context c){
        return MobileStoragePaths.dataFile(c,"recommendation-portable-package-v1.json");
    }

    private static List<String> strings(JSONArray arr){
        ArrayList<String> out=new ArrayList<>();
        if(arr!=null)for(int i=0;i<arr.length();i++){
            String value=arr.optString(i,"").trim();
            if(!value.isEmpty()&&!out.contains(value))out.add(value);
        }
        return out;
    }

    static synchronized Snapshot load(Context context){
        Snapshot out=new Snapshot();File f=file(context);if(!f.isFile())return out;
        try(InputStream in=new FileInputStream(f);ByteArrayOutputStream bytes=new ByteArrayOutputStream()){
            byte[] buffer=new byte[16384];int n;
            while((n=in.read(buffer))>0)bytes.write(buffer,0,n);
            return parse(new JSONObject(bytes.toString("UTF-8")));
        }catch(Exception ignored){return out;}
    }

    static synchronized Snapshot save(Context context,JSONObject root){
        if(root==null)throw new IllegalArgumentException("portable package is required");
        Snapshot parsed=parse(root);
        File target=file(context);target.getParentFile().mkdirs();
        File tmp=new File(target.getParentFile(),target.getName()+".tmp");
        try(OutputStream out=new FileOutputStream(tmp)){
            out.write(root.toString().getBytes(StandardCharsets.UTF_8));
        }catch(Exception e){throw new IllegalStateException("无法保存推荐基础包",e);}
        if(target.exists()&&!target.delete()){tmp.delete();throw new IllegalStateException("无法替换推荐基础包");}
        if(!tmp.renameTo(target)){tmp.delete();throw new IllegalStateException("无法写入推荐基础包");}
        return parsed;
    }

    private static Snapshot parse(JSONObject root){
        Snapshot out=new Snapshot();if(root==null)return out;
        out.schemaVersion=root.optInt("schemaVersion",1);
        out.generatedAt=root.optString("generatedAt","");
        out.engineVersion=root.optString("engineVersion","");
        JSONObject foundation=root.optJSONObject("foundation");
        if(foundation!=null){
            out.policyRevision=foundation.optInt("policyRevision",0);
            out.visualGeneration=foundation.optString("visualGeneration","");
            out.canonicalGeneration=foundation.optString("canonicalGeneration","");
            JSONArray bindings=foundation.optJSONArray("identityBindings");
            if(bindings!=null)for(int i=0;i<bindings.length();i++){
                JSONObject row=bindings.optJSONObject(i);if(row==null)continue;
                String comicId=row.optString("comicId","").trim(),workId=row.optString("workId","").trim();
                if(comicId.isEmpty()||workId.isEmpty())continue;
                out.identityByComic.put(comicId,new Identity(
                    comicId,
                    workId,
                    row.optString("workTitle",""),
                    row.optString("editionId",""),
                    row.optString("editionLabel",""),
                    row.optString("bindingStatus",""),
                    row.optDouble("confidence",0d),
                    row.optString("resolverVersion","")
                ));
            }
        }
        JSONObject behavior=root.optJSONObject("behavior");
        if(behavior!=null)out.behaviorGeneration=behavior.optString("generation","");
        JSONObject reservoir=root.optJSONObject("reservoir");
        if(reservoir!=null){
            out.reservoirGeneration=reservoir.optString("generation","");
            out.sourceCycleId=reservoir.optString("sourceCycleId","");
        }
        Map<String,JSONObject> visual=new HashMap<>();
        JSONObject visualRoot=root.optJSONObject("visual");
        JSONArray visualRows=visualRoot==null?null:visualRoot.optJSONArray("signals");
        if(visualRows!=null)for(int i=0;i<visualRows.length();i++){
            JSONObject row=visualRows.optJSONObject(i);
            if(row!=null&&!row.optString("comicId","").isEmpty())
                visual.put(row.optString("comicId"),row);
        }
        JSONArray candidates=reservoir==null?null:reservoir.optJSONArray("candidates");
        if(candidates!=null)for(int i=0;i<candidates.length();i++){
            JSONObject row=candidates.optJSONObject(i);if(row==null)continue;
            String id=row.optString("comicId","").trim();if(id.isEmpty())continue;
            JSONObject v=visual.get(id);
            Candidate candidate=new Candidate(
                id,row.optString("providerId",""),row.optString("title",id),
                row.optString("author",""),row.optString("canonicalAuthor",""),
                row.optString("coverUrl",""),strings(row.optJSONArray("tags")),
                strings(row.optJSONArray("categories")),
                Math.max(0,row.optInt("pagesCount",0)),
                Math.max(0,row.optInt("totalLikes",0)),
                Math.max(0,row.optInt("totalViews",0)),
                Math.max(1,row.optInt("desktopPoolRank",i+1)),
                v!=null,
                v==null?0d:v.optDouble("affinity",0d),
                v==null?0d:v.optDouble("confidence",0d),
                v==null?"":v.optString("sourceKind","")
            );
            out.candidates.add(candidate);out.candidateById.put(id,candidate);
        }
        return out;
    }

    static double visualAdjustment(Context context,String comicId){return load(context).visualAdjustment(comicId);}

    static Set<String> missingVisualIds(Context context,int limit){
        LinkedHashSet<String> out=new LinkedHashSet<>();
        for(Candidate row:load(context).candidates){
            if(!row.visualAvailable)out.add(row.comicId);
            if(out.size()>=Math.max(1,limit))break;
        }
        return out;
    }

    static String summary(Context context){
        Snapshot s=load(context);
        if(!s.available())return "尚未同步候选基础包";
        return s.candidates.size()+" 个候选 · Canonical "+s.identityBindingCount()+" · Visual "+(s.visualGeneration.isEmpty()?"无":s.visualGeneration.substring(0,Math.min(8,s.visualGeneration.length())));
    }
}
