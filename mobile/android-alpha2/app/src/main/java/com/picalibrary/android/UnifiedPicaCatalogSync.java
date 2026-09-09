package com.picalibrary.android;

import android.content.Context;
import java.time.Instant;
import java.util.List;

final class UnifiedPicaCatalogSync {
    private UnifiedPicaCatalogSync(){}

    static UnifiedCatalogStore.Entry merge(Context context,PicaClient.Comic comic){
        UnifiedCatalogStore.Snapshot snapshot=UnifiedCatalogStore.load(context);UnifiedCatalogStore.Entry entry=snapshot.byId.get(comic.id);
        if(entry==null){entry=new UnifiedCatalogStore.Entry(comic.id,comic.title,comic.author);snapshot.byId.put(comic.id,entry);}
        if(!comic.title.isEmpty())entry.title=comic.title;if(!comic.author.isEmpty())entry.author=comic.author;
        entry.tags.clear();entry.tags.addAll(comic.tags);entry.categories.clear();entry.categories.addAll(comic.categories);entry.finished=comic.finished;entry.knownPictures=Math.max(entry.knownPictures,comic.pagesCount);entry.picaAvailable=true;entry.updatedAt=Instant.now().toString();UnifiedCatalogStore.save(context,snapshot);return entry;
    }

    static void mergeAll(Context context,List<PicaClient.Comic> comics){UnifiedCatalogStore.Snapshot snapshot=UnifiedCatalogStore.load(context);for(PicaClient.Comic comic:comics){UnifiedCatalogStore.Entry entry=snapshot.byId.get(comic.id);if(entry==null){entry=new UnifiedCatalogStore.Entry(comic.id,comic.title,comic.author);snapshot.byId.put(comic.id,entry);}if(!comic.title.isEmpty())entry.title=comic.title;if(!comic.author.isEmpty())entry.author=comic.author;entry.tags.clear();entry.tags.addAll(comic.tags);entry.categories.clear();entry.categories.addAll(comic.categories);entry.finished=comic.finished;entry.knownPictures=Math.max(entry.knownPictures,comic.pagesCount);entry.picaAvailable=true;}UnifiedCatalogStore.save(context,snapshot);}
}
