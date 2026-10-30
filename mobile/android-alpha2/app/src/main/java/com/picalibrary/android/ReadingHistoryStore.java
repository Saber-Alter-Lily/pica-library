package com.picalibrary.android;

import android.content.Context;
import android.content.SharedPreferences;
import java.io.File;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.json.JSONObject;

/**
 * Preserve the original installed app API and explicit legacy-account migration.
 * Shared session JSON/read/write/filter logic lives only in :local-storage.
 * MobileStoragePaths still selects the original installed profile and external-data root.
 */
final class ReadingHistoryStore extends ReaderHistoryLedger {
    private static final String MIGRATION_PREF="reading-history-v1",LOCAL_IMPORTED="local-bookmarks-imported";
    private ReadingHistoryStore(){}

    private static File file(Context context){
        return MobileStoragePaths.dataFile(context,ReaderHistoryLedger.FILE);
    }
    static Snapshot load(Context context){return ReaderHistoryLedger.load(file(context));}
    static synchronized void record(Context context,String sessionId,String comicId,String chapterId,
                                    String title,String author,String chapterTitle,String providerId,
                                    String sourceKind,int page,String startedAt,String lastReadAt){
        record(context,sessionId,comicId,chapterId,title,author,chapterTitle,0,
               providerId,sourceKind,page,startedAt,lastReadAt);
    }
    static synchronized void record(Context context,String sessionId,String comicId,String chapterId,
                                    String title,String author,String chapterTitle,int chapterOrder,
                                    String providerId,String sourceKind,int page,String startedAt,String lastReadAt){
        ReaderHistoryLedger.record(context,file(context),sessionId,comicId,chapterId,title,author,
                                   chapterTitle,chapterOrder,providerId,sourceKind,page,startedAt,lastReadAt);
    }
    static synchronized void importLegacy(Context context,List<Legacy> values){
        ReaderHistoryLedger.importLegacy(context,file(context),values);
    }

    // New Host bookmarks already have current ledger rows; never reinterpret them as legacy provider records.
    static synchronized void importLocalBookmarksOnce(Context context){SharedPreferences marker=context.getSharedPreferences(MIGRATION_PREF,Context.MODE_PRIVATE);if(marker.getBoolean(LOCAL_IMPORTED,false))return;SharedPreferences bookmarks=context.getSharedPreferences("reader-bookmarks-v1",Context.MODE_PRIVATE);UnifiedCatalogStore.Snapshot catalog=UnifiedCatalogStore.load(context);ArrayList<Legacy> rows=new ArrayList<>();for(Map.Entry<String,?> item:bookmarks.getAll().entrySet()){if(item.getKey().startsWith("recent:")||!(item.getValue() instanceof String))continue;try{JSONObject o=new JSONObject((String)item.getValue());String comic=o.optString("comic",""),chapter=o.optString("chapter","");String updated=o.optString("updatedAt","");if(comic.isEmpty()||comic.startsWith("hosted:")||chapter.isEmpty()||updated.isEmpty())continue;UnifiedCatalogStore.Entry e=catalog.byId.get(comic);String title=e==null?"漫画":e.title,author=e==null?"未知作者":e.displayAuthor(),provider=e==null?(EhClient.isEhId(comic)?"eh":""):e.providerId;rows.add(new Legacy("android-bookmark",comic,chapter,title,author,"章节",provider,"legacy",o.optInt("page",0),updated,DeviceIdentity.id(context)));}catch(Exception ignored){}}importLegacy(context,rows);marker.edit().putBoolean(LOCAL_IMPORTED,true).apply();}
}
