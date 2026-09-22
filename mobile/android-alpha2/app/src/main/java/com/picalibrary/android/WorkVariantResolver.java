package com.picalibrary.android;

import android.content.Context;
import java.util.*;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Read-only work-variant resolver. Paired Android prefers Desktop's full
 * Canonical Work evidence; offline Android falls back to the last synced
 * portable Canonical bindings and never invents probable identity links.
 */
final class WorkVariantResolver {
    private WorkVariantResolver(){}

    static JSONObject load(Context context,String comicId){
        if(BridgeStore.paired(context)){
            try{return BridgeClient.workVariants(context,comicId);}
            catch(Exception ignored){}
        }
        return local(context,comicId);
    }

    static JSONObject local(Context context,String comicId){
        JSONObject root=new JSONObject();JSONArray items=new JSONArray();
        try{
            String id=comicId==null?"":comicId.trim();
            root.put("comicId",id);root.put("items",items);
            PortableRecommendationPackageStore.Snapshot portable=PortableRecommendationPackageStore.load(context);
            PortableRecommendationPackageStore.Identity current=portable.identityByComic.get(id);
            if(current==null||current.workId.isEmpty()){
                root.put("count",0);root.put("confirmedCount",0);root.put("probableCount",0);
                root.put("workId",JSONObject.NULL);root.put("editionId",JSONObject.NULL);
                return root;
            }
            UnifiedCatalogStore.Snapshot catalog=UnifiedCatalogStore.load(context);
            ArrayList<JSONObject> rows=new ArrayList<>();
            for(PortableRecommendationPackageStore.Identity identity:portable.identityByComic.values()){
                if(identity==null||identity.comicId.equals(id)||!identity.workId.equals(current.workId))continue;
                UnifiedCatalogStore.Entry entry=catalog.byId.get(identity.comicId);
                PortableRecommendationPackageStore.Candidate candidate=portable.candidateById.get(identity.comicId);
                JSONObject row=new JSONObject();
                row.put("comicId",identity.comicId);
                boolean sameEdition=!current.editionId.isEmpty()&&!identity.editionId.isEmpty()&&current.editionId.equals(identity.editionId);
                row.put("relation",sameEdition?"CONFIRMED_SAME_EDITION":"CONFIRMED_WORK_VARIANT");
                row.put("confidence",Math.max(current.confidence,identity.confidence));
                row.put("workId",identity.workId);
                row.put("editionId",identity.editionId.isEmpty()?JSONObject.NULL:identity.editionId);
                row.put("editionLabel",identity.editionLabel);
                String title=entry!=null?entry.title:candidate!=null?candidate.title:identity.workTitle;
                String author=entry!=null?entry.author:candidate!=null?candidate.author:"";
                String canonical=entry!=null?entry.canonicalAuthor:candidate!=null?candidate.canonicalAuthor:"";
                int pages=entry!=null?Math.max(entry.knownPictures,entry.desktopDownloadedPictures):candidate!=null?candidate.pagesCount:0;
                String provider=entry!=null&&!entry.providerId.isEmpty()?entry.providerId:candidate!=null?candidate.providerId:identity.comicId.startsWith("eh:")?"eh":"pica";
                row.put("title",title);row.put("author",author);row.put("canonicalAuthor",canonical);
                row.put("pagesCount",Math.max(0,pages));row.put("providerId",provider);
                row.put("isFavorite",entry!=null&&entry.favorite);
                int downloaded=entry==null?0:Math.max(entry.desktopDownloadedPictures,entry.phoneDownloaded?entry.knownPictures:0);
                row.put("downloadedPictures",Math.max(0,downloaded));
                row.put("knownPictures",entry==null?Math.max(0,pages):Math.max(0,entry.knownPictures));
                if(entry!=null&&!entry.desktopCoverPath.isEmpty())row.put("coverPath",entry.desktopCoverPath);
                rows.add(row);
            }
            rows.sort((a,b)->{
                int favorite=Boolean.compare(b.optBoolean("isFavorite"),a.optBoolean("isFavorite"));if(favorite!=0)return favorite;
                int downloaded=Integer.compare(b.optInt("downloadedPictures",0),a.optInt("downloadedPictures",0));if(downloaded!=0)return downloaded;
                return a.optString("title","").compareToIgnoreCase(b.optString("title",""));
            });
            for(JSONObject row:rows)items.put(row);
            root.put("count",items.length());root.put("confirmedCount",items.length());root.put("probableCount",0);
            root.put("workId",current.workId);root.put("editionId",current.editionId.isEmpty()?JSONObject.NULL:current.editionId);
        }catch(Exception ignored){
            try{root.put("count",0);root.put("confirmedCount",0);root.put("probableCount",0);root.put("items",items);}catch(Exception ignored2){}
        }
        return root;
    }
}
