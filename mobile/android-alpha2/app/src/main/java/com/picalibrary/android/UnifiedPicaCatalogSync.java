package com.picalibrary.android;

import android.content.Context;
import java.time.Instant;
import java.util.List;

/** Merges Pica-discovered metadata into the comic-centric catalog without disturbing other providers. */
final class UnifiedPicaCatalogSync {
    private UnifiedPicaCatalogSync(){}

    static UnifiedCatalogStore.Entry merge(Context context,PicaClient.Comic comic){
        UnifiedCatalogStore.Snapshot snapshot=UnifiedCatalogStore.load(context);UnifiedCatalogStore.Entry entry=apply(snapshot,comic);UnifiedCatalogStore.save(context,snapshot);return entry;
    }
    static void mergeAll(Context context,List<PicaClient.Comic> comics){UnifiedCatalogStore.Snapshot snapshot=UnifiedCatalogStore.load(context);for(PicaClient.Comic comic:comics)apply(snapshot,comic);UnifiedCatalogStore.save(context,snapshot);}
    static void clearAvailability(Context context){UnifiedCatalogStore.Snapshot snapshot=UnifiedCatalogStore.load(context);for(UnifiedCatalogStore.Entry entry:snapshot.byId.values())entry.picaAvailable=false;UnifiedCatalogStore.save(context,snapshot);NativeRecommendationStore.invalidateForFavoriteChange(context);}

    private static UnifiedCatalogStore.Entry apply(UnifiedCatalogStore.Snapshot snapshot,PicaClient.Comic comic){
        UnifiedCatalogStore.Entry entry=snapshot.byId.get(comic.id);if(entry==null){entry=new UnifiedCatalogStore.Entry(comic.id,comic.title,comic.author);snapshot.byId.put(comic.id,entry);}
        if(!comic.title.isEmpty())entry.title=comic.title;if(!comic.author.isEmpty())entry.author=comic.author;
        if(!comic.coverUrl.isEmpty())entry.picaCoverUrl=comic.coverUrl;
        if(!comic.tags.isEmpty()){entry.tags.clear();entry.tags.addAll(comic.tags);}if(!comic.categories.isEmpty()){entry.categories.clear();entry.categories.addAll(comic.categories);}
        entry.finished=comic.finished;entry.knownPictures=Math.max(entry.knownPictures,comic.pagesCount);entry.picaAvailable=true;
        // Pica list/detail objects do not currently expose a reliable updated_at in the Android contract.
        // Keep the first-seen timestamp stable instead of rewriting it on every browse, otherwise cache
        // identities and “recently updated” sorting churn even when nothing changed.
        if(entry.updatedAt==null||entry.updatedAt.isEmpty())entry.updatedAt=Instant.now().toString();
        return entry;
    }
}
