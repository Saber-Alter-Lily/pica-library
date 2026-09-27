package com.picalibrary.android;

import android.content.Context;
import java.time.Instant;
import java.util.*;

/**
 * Android Pica favorites reconciliation aligned with the Desktop quick-sync contract.
 * Normal runs inspect the newest pages until a stable overlap is found. Full pagination
 * is reserved for initial/periodic reconciliation or count/order/overlap anomalies.
 */
final class PicaFavoriteReconciler {
    interface Progress {
        void update(String phase,String mode,int page,int pages,int fetched,int total,int found,String fallbackReason);
    }
    interface Control { void checkpoint() throws InterruptedException; }

    static final class Result {
        final List<PicaClient.Comic> refreshedComics;
        final boolean full;
        final int pagesChecked,remoteTotal,foundNew;
        final String fallbackReason;
        Result(List<PicaClient.Comic> refreshedComics,boolean full,int pagesChecked,int remoteTotal,int foundNew,String fallbackReason){
            this.refreshedComics=refreshedComics;this.full=full;this.pagesChecked=pagesChecked;this.remoteTotal=remoteTotal;this.foundNew=foundNew;this.fallbackReason=fallbackReason==null?"":fallbackReason;
        }
    }

    private static final long FULL_RECONCILE_INTERVAL_MS=24L*60L*60L*1000L;
    private static final int STABLE_OVERLAP_IDS=8;
    private static final int MAX_QUICK_PAGES=5;

    private PicaFavoriteReconciler(){}

    static Result sync(Context context,PicaClient client,Progress progress,Control control) throws Exception {
        Context app=context.getApplicationContext();
        EhFavoriteStore.migrateLegacyEhLocals(app);
        FavoriteCacheStore.Snapshot prior=FavoriteCacheStore.load(app);
        LinkedHashMap<String,BridgeClient.ComicItem> priorById=new LinkedHashMap<>();
        LinkedHashSet<String> known=new LinkedHashSet<>();
        for(BridgeClient.ComicItem item:prior.items){
            if(item==null||item.id==null||item.id.isEmpty())continue;
            priorById.put(item.id,item);
            if(!EhClient.isEhId(item.id))known.add(item.id);
        }
        if(known.isEmpty()||fullDue(prior))return full(app,client,prior,priorById,progress,control,known.isEmpty()?"initial-reconciliation":"periodic-reconciliation");

        ArrayList<PicaClient.Comic> collected=new ArrayList<>();
        LinkedHashSet<String> unseen=new LinkedHashSet<>();
        HashSet<String> observed=new HashSet<>();
        int page=1,remoteTotal=0,totalPages=0;
        boolean stableOverlap=false,orderingAnomaly=false;
        int overlapRequired=Math.min(STABLE_OVERLAP_IDS,Math.max(1,known.size()));

        while(page<=MAX_QUICK_PAGES){
            checkpoint(control);
            PicaClient.ComicPage result=client.favorites(page,"dd");
            remoteTotal=Math.max(0,result.total);
            totalPages=Math.max(1,result.pages);
            for(PicaClient.Comic comic:result.comics){
                if(comic==null||comic.id==null||comic.id.isEmpty())continue;
                if(!observed.add(comic.id))orderingAnomaly=true;
                collected.add(comic);
                if(!known.contains(comic.id))unseen.add(comic.id);
            }
            int trailingKnown=0;
            for(int i=collected.size()-1;i>=0;i--){
                if(!known.contains(collected.get(i).id))break;
                trailingKnown++;
            }
            stableOverlap=trailingKnown>=overlapRequired;
            boolean countConsistent=remoteTotal==known.size()+unseen.size();
            if(progress!=null)progress.update("reading","quick",page,totalPages,collected.size(),remoteTotal,unseen.size(),"");
            if(stableOverlap&&countConsistent&&!orderingAnomaly)break;
            if(page>=totalPages)break;
            page++;
        }

        boolean countConsistent=remoteTotal==known.size()+unseen.size();
        if(!stableOverlap||!countConsistent||orderingAnomaly){
            String reason=orderingAnomaly?"pagination-ordering-anomaly":!countConsistent?"remote-count-anomaly":"stable-overlap-not-found";
            return full(app,client,prior,priorById,progress,control,reason);
        }

        checkpoint(control);
        if(progress!=null)progress.update("processing","quick",page,totalPages,collected.size(),remoteTotal,unseen.size(),"");
        List<BridgeClient.ComicItem> merged=mergeQuick(prior.items,priorById,collected);
        int mergedPicaCount=0;for(BridgeClient.ComicItem item:merged)if(item!=null&&!EhClient.isEhId(item.id))mergedPicaCount++;
        if(mergedPicaCount!=remoteTotal)return full(app,client,prior,priorById,progress,control,"merged-count-anomaly");
        boolean keepCovers=prior.coversPrefetched&&unseen.isEmpty();
        FavoriteCacheStore.savePicaSync(app,merged,keepCovers,false,remoteTotal);
        return new Result(collected,false,page,remoteTotal,unseen.size(),"");
    }

    private static Result full(Context app,PicaClient client,FavoriteCacheStore.Snapshot prior,Map<String,BridgeClient.ComicItem> priorById,Progress progress,Control control,String reason) throws Exception {
        ArrayList<PicaClient.Comic> all=new ArrayList<>();
        final int[] pagesChecked={0};
        List<PicaClient.Comic> fetched=client.favoritesAll((page,pages,count,total)->{
            checkpoint(control);
            pagesChecked[0]=page;
            if(progress!=null)progress.update("reading","full",page,pages,count,total,0,reason);
        });
        all.addAll(fetched);
        checkpoint(control);
        LinkedHashSet<String> priorPica=new LinkedHashSet<>();for(BridgeClient.ComicItem item:prior.items)if(item!=null&&!EhClient.isEhId(item.id))priorPica.add(item.id);
        int found=0;for(PicaClient.Comic comic:all)if(!priorPica.contains(comic.id))found++;
        if(progress!=null)progress.update("processing","full",pagesChecked[0],pagesChecked[0],all.size(),all.size(),found,reason);
        ArrayList<BridgeClient.ComicItem> items=new ArrayList<>();
        for(PicaClient.Comic comic:all)items.add(itemFromComic(comic,priorById.get(comic.id)));
        for(BridgeClient.ComicItem item:prior.items)if(item!=null&&EhClient.isEhId(item.id))items.add(item);
        FavoriteCacheStore.savePicaSync(app,items,false,true,all.size());
        return new Result(all,true,pagesChecked[0],all.size(),found,reason);
    }

    private static List<BridgeClient.ComicItem> mergeQuick(List<BridgeClient.ComicItem> prior,Map<String,BridgeClient.ComicItem> priorById,List<PicaClient.Comic> head){
        ArrayList<BridgeClient.ComicItem> out=new ArrayList<>();
        HashSet<String> emitted=new HashSet<>();
        for(PicaClient.Comic comic:head){
            if(comic==null||comic.id==null||comic.id.isEmpty()||!emitted.add(comic.id))continue;
            out.add(itemFromComic(comic,priorById.get(comic.id)));
        }
        for(BridgeClient.ComicItem item:prior){
            if(item==null||item.id==null||item.id.isEmpty()||!emitted.add(item.id))continue;
            out.add(item);
        }
        return out;
    }

    private static BridgeClient.ComicItem itemFromComic(PicaClient.Comic comic,BridgeClient.ComicItem prior){
        String title=comic.title==null||comic.title.isEmpty()?(prior==null?"未命名漫画":prior.title):comic.title;
        String author=comic.author==null||comic.author.isEmpty()?(prior==null?"未知作者":prior.author):comic.author;
        String coverPath=prior==null?"":prior.coverPath;
        int downloaded=prior==null?0:prior.downloadedPictures;
        return new BridgeClient.ComicItem(comic.id,title,author,coverPath,downloaded);
    }

    private static boolean fullDue(FavoriteCacheStore.Snapshot prior){
        if(prior.lastPicaFullSyncAt==null||prior.lastPicaFullSyncAt.isEmpty())return true;
        try{return System.currentTimeMillis()-Instant.parse(prior.lastPicaFullSyncAt).toEpochMilli()>=FULL_RECONCILE_INTERVAL_MS;}catch(Exception ignored){return true;}
    }

    private static void checkpoint(Control control) throws InterruptedException {if(control!=null)control.checkpoint();}
}
