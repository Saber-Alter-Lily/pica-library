package com.picalibrary.android;

import android.content.Context;
import java.time.Instant;
import java.util.List;

/** Merges public E-H metadata into the shared mobile catalog while preserving lossless provider semantics separately. */
final class UnifiedEhCatalogSync {
    private UnifiedEhCatalogSync(){}

    static UnifiedCatalogStore.Entry merge(Context context,EhClient.Comic comic){UnifiedCatalogStore.Snapshot snapshot=UnifiedCatalogStore.load(context);UnifiedCatalogStore.Entry entry=apply(snapshot,comic);UnifiedCatalogStore.save(context,snapshot);EhSemanticStore.merge(context,comic);return entry;}
    static void mergeAll(Context context,List<EhClient.Comic> comics){UnifiedCatalogStore.Snapshot snapshot=UnifiedCatalogStore.load(context);for(EhClient.Comic comic:comics)apply(snapshot,comic);UnifiedCatalogStore.save(context,snapshot);EhSemanticStore.mergeAll(context,comics);}
    static void clearAvailability(Context context){UnifiedCatalogStore.Snapshot snapshot=UnifiedCatalogStore.load(context);for(UnifiedCatalogStore.Entry entry:snapshot.byId.values())entry.ehAvailable=false;UnifiedCatalogStore.save(context,snapshot);}

    private static UnifiedCatalogStore.Entry apply(UnifiedCatalogStore.Snapshot snapshot,EhClient.Comic comic){UnifiedCatalogStore.Entry entry=snapshot.byId.get(comic.id);if(entry==null){entry=new UnifiedCatalogStore.Entry(comic.id,comic.title,comic.author);snapshot.byId.put(comic.id,entry);}entry.providerId="eh";entry.providerRemoteId=comic.remoteId;entry.completionStatus="UNKNOWN";if(!comic.title.isEmpty())entry.title=comic.title;if(!comic.alternateTitle.isEmpty()){entry.alternateTitles.clear();entry.alternateTitles.add(comic.alternateTitle);}if(!comic.author.isEmpty())entry.author=comic.author;entry.uploader=comic.uploader;entry.description="";entry.chineseTeam="";entry.finished=false;if(!comic.coverUrl.isEmpty())entry.ehCoverUrl=comic.coverUrl;entry.tags.clear();entry.tags.addAll(comic.tags);entry.categories.clear();if(!comic.category.isEmpty())entry.categories.add(comic.category);entry.knownPictures=Math.max(entry.knownPictures,comic.pagesCount);entry.rating=comic.rating;entry.ehAvailable=true;if(!entry.sourceBindings.contains(comic.surface))entry.sourceBindings.add(comic.surface);if(entry.updatedAt==null||entry.updatedAt.isEmpty())entry.updatedAt=comic.posted>0?Instant.ofEpochSecond(comic.posted).toString():Instant.now().toString();return entry;}
}
