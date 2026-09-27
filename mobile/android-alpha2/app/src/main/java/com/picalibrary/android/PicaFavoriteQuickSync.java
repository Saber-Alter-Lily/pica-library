package com.picalibrary.android;

import android.content.Context;
import android.content.SharedPreferences;
import java.time.Instant;
import java.util.*;

/**
 * Bounded Pica favorite reconciliation for recommendation/runtime refreshes.
 *
 * Normal no-change runs read only the newest page. Small append-only changes
 * may read up to MAX_QUICK_PAGES to find a stable overlap with the previous
 * ordered snapshot. Any ambiguous count/order/removal case falls back to the
 * authoritative full pagination path.
 */
final class PicaFavoriteQuickSync {
    interface Progress { void update(String phase,int done,int total) throws Exception; }
    static final class Result {
        final List<PicaClient.Comic> observed;
        final List<String> orderedIds;
        final boolean fullScan;
        final int pagesFetched;
        final int total;
        Result(List<PicaClient.Comic> observed,List<String> orderedIds,boolean fullScan,int pagesFetched,int total){
            this.observed=observed;this.orderedIds=orderedIds;this.fullScan=fullScan;this.pagesFetched=pagesFetched;this.total=total;
        }
    }

    private static final String PREFS="pica-favorite-quick-sync";
    private static final String KEY_LAST_FULL="lastFullSyncMs";
    private static final long FULL_AUDIT_MS=24L*60L*60L*1000L;
    private static final int MAX_QUICK_PAGES=3;

    private PicaFavoriteQuickSync(){}

    static Result sync(Context context,PicaClient client,Progress progress) throws Exception {
        Context app=context.getApplicationContext();
        FavoriteCacheStore.Snapshot prior=FavoriteCacheStore.load(app);
        List<String> priorIds=picaIds(prior.items);
        SharedPreferences prefs=app.getSharedPreferences(PREFS,Context.MODE_PRIVATE);
        long lastFull=prefs.getLong(KEY_LAST_FULL,0L);
        boolean periodic=lastFull<=0L||System.currentTimeMillis()-lastFull>=FULL_AUDIT_MS;

        if(progress!=null)progress.update("正在检查 Pica 收藏变化",0,1);
        PicaClient.ComicPage first=client.favorites(1,"dd");
        List<PicaClient.Comic> observed=new ArrayList<>(first.comics);
        int pagesFetched=1;

        if(!periodic&&!priorIds.isEmpty()&&first.total==priorIds.size()&&prefixMatches(first.comics,priorIds,0)){
            persist(app,prior,priorIds,first.comics);
            if(progress!=null)progress.update("Pica 收藏无变化 · 已检查最新页",1,1);
            return new Result(observed,new ArrayList<>(priorIds),false,pagesFetched,first.total);
        }

        if(!periodic&&!priorIds.isEmpty()&&first.total>priorIds.size()){
            int delta=first.total-priorIds.size();
            List<PicaClient.Comic> quick=new ArrayList<>(first.comics);
            int page=2;
            while(quick.size()<=delta&&page<=first.pages&&page<=MAX_QUICK_PAGES){
                if(progress!=null)progress.update("正在核对最近新增收藏 · 第 "+page+" 页",page-1,Math.min(first.pages,MAX_QUICK_PAGES));
                PicaClient.ComicPage next=client.favorites(page,"dd");
                quick.addAll(next.comics);observed.addAll(next.comics);pagesFetched++;page++;
            }
            if(delta<quick.size()&&prefixMatches(quick,priorIds,delta)&&newPrefixIsUnknown(quick,priorIds,delta)){
                List<String> nextIds=new ArrayList<>();
                for(int i=0;i<delta;i++)nextIds.add(quick.get(i).id);
                nextIds.addAll(priorIds);
                if(nextIds.size()==first.total){
                    persist(app,prior,nextIds,quick);
                    if(progress!=null)progress.update("Pica 收藏已增量更新 · 新增 "+delta+" 本",1,1);
                    return new Result(observed,nextIds,false,pagesFetched,first.total);
                }
            }
        }

        if(progress!=null)progress.update(periodic?"正在执行 Pica 收藏定期完整校验":"收藏顺序或数量无法安全增量核对，正在完整校验",0,Math.max(1,first.pages));
        List<PicaClient.Comic> full=new ArrayList<>(first.comics);
        for(int page=2;page<=first.pages;page++){
            PicaClient.ComicPage next=client.favorites(page,"dd");
            full.addAll(next.comics);pagesFetched++;
            if(progress!=null)progress.update("正在完整读取 Pica 收藏 · 第 "+page+" / "+first.pages+" 页",page,first.pages);
        }
        List<String> ids=new ArrayList<>();for(PicaClient.Comic comic:full)if(comic!=null&&!comic.id.isEmpty())ids.add(comic.id);
        persist(app,prior,ids,full);
        prefs.edit().putLong(KEY_LAST_FULL,System.currentTimeMillis()).apply();
        if(progress!=null)progress.update("Pica 收藏完整校验完成 · "+ids.size()+" 本",1,1);
        return new Result(full,ids,true,pagesFetched,ids.size());
    }

    private static List<String> picaIds(List<BridgeClient.ComicItem> items){
        List<String> out=new ArrayList<>();
        for(BridgeClient.ComicItem item:items)if(item!=null&&!EhClient.isEhId(item.id)&&!item.id.isEmpty())out.add(item.id);
        return out;
    }

    private static boolean prefixMatches(List<PicaClient.Comic> remote,List<String> known,int remoteStart){
        if(remoteStart<0||remoteStart>=remote.size())return known.isEmpty();
        int comparable=Math.min(known.size(),remote.size()-remoteStart);
        if(comparable<=0)return false;
        for(int i=0;i<comparable;i++)if(!known.get(i).equals(remote.get(remoteStart+i).id))return false;
        return true;
    }

    private static boolean newPrefixIsUnknown(List<PicaClient.Comic> remote,List<String> known,int count){
        Set<String> ids=new HashSet<>(known);
        if(count<0||count>remote.size())return false;
        for(int i=0;i<count;i++)if(remote.get(i)==null||remote.get(i).id.isEmpty()||ids.contains(remote.get(i).id))return false;
        return true;
    }

    private static void persist(Context context,FavoriteCacheStore.Snapshot prior,List<String> picaIds,List<PicaClient.Comic> observed){
        Map<String,BridgeClient.ComicItem> old=new LinkedHashMap<>();
        for(BridgeClient.ComicItem item:prior.items)old.put(item.id,item);
        Map<String,PicaClient.Comic> fresh=new HashMap<>();
        for(PicaClient.Comic comic:observed)if(comic!=null&&!comic.id.isEmpty())fresh.put(comic.id,comic);
        List<BridgeClient.ComicItem> next=new ArrayList<>();
        for(String id:picaIds){
            PicaClient.Comic comic=fresh.get(id);BridgeClient.ComicItem previous=old.get(id);
            String title=comic!=null?comic.title:previous!=null?previous.title:"未命名漫画";
            String author=comic!=null?comic.author:previous!=null?previous.author:"未知作者";
            String cover=previous==null?"":previous.coverPath;
            int downloaded=previous==null?0:previous.downloadedPictures;
            next.add(new BridgeClient.ComicItem(id,title,author,cover,downloaded));
        }
        for(BridgeClient.ComicItem item:prior.items)if(EhClient.isEhId(item.id))next.add(item);
        FavoriteCacheStore.save(context,next,false);
    }
}
