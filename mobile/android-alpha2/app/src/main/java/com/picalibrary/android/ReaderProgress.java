package com.picalibrary.android;

import android.content.Context;
import android.content.SharedPreferences;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONObject;

/** Local bookmark first. History ledger is updated independently from portable sync acknowledgement. */
final class ReaderProgress {
    private static final ExecutorService SYNC = Executors.newSingleThreadExecutor();
    private static final String ONE_SHOT_PREF="reader-history-one-shot-v1";
    private final Context context;
    private final SharedPreferences store;
    private final ReaderSource source;
    private final String prefix;
    private boolean syncing;
    private String historySessionId="",historyDay="",historyStartedAt="";

    ReaderProgress(Context context, ReaderSource source) {
        this.context=context.getApplicationContext();
        store = this.context.getSharedPreferences("reader-bookmarks-v1", Context.MODE_PRIVATE);
        this.source = source;
        prefix = source.scope() + ":";
    }

    private static String bookmarkKey(String prefix, String comic, String chapter) {
        return prefix + ReaderPolicy.hash(comic + "\n" + chapter);
    }
    private String key(String comic, String chapter) { return bookmarkKey(prefix, comic, chapter); }
    private static String oneShotKey(String comic,String chapter){return ReaderPolicy.hash((comic==null?"":comic)+"\n"+(chapter==null?"":chapter));}

    static void seedOneShotPosition(Context context,String comic,String chapter,int page){if(context==null||comic==null||comic.isEmpty()||chapter==null||chapter.isEmpty())return;context.getSharedPreferences(ONE_SHOT_PREF,Context.MODE_PRIVATE).edit().putInt(oneShotKey(comic,chapter),Math.max(0,page)).apply();}

    int position(String comic, String chapter, int fallback) {
        SharedPreferences oneShot=context.getSharedPreferences(ONE_SHOT_PREF,Context.MODE_PRIVATE);String overrideKey=oneShotKey(comic,chapter);if(oneShot.contains(overrideKey)){int value=Math.max(0,oneShot.getInt(overrideKey,fallback));oneShot.edit().remove(overrideKey).apply();return value;}
        try { return new JSONObject(store.getString(key(comic, chapter), "{}")).optInt("page", fallback); }
        catch (Exception e) { return fallback; }
    }

    String recentChapter(String comic) {
        String local = store.getString("recent:" + prefix + comic, "");
        return local == null ? "" : local;
    }

    static void mergeRemote(
        Context context,
        String scope,
        String comic,
        String chapter,
        int page,
        String updatedAt
    ) {
        if (comic == null || chapter == null || updatedAt == null || updatedAt.isEmpty()) return;
        SharedPreferences store = context.getSharedPreferences("reader-bookmarks-v1", Context.MODE_PRIVATE);
        String prefix = scope + ":";
        String key = bookmarkKey(prefix, comic, chapter);
        try {
            JSONObject local = new JSONObject(store.getString(key, "{}"));
            String localUpdatedAt = local.optString("updatedAt", "");
            if (!localUpdatedAt.isEmpty() && localUpdatedAt.compareTo(updatedAt) > 0) return;
            JSONObject value = new JSONObject();
            value.put("comic", comic);
            value.put("chapter", chapter);
            value.put("page", Math.max(0, page));
            value.put("revision", local.optLong("revision", 0));
            value.put("updatedAt", updatedAt);
            value.put("pending", false);
            store.edit()
                .putString(key, value.toString())
                .putString("recent:" + prefix + comic, chapter)
                .apply();
        } catch (Exception ignored) { }
    }

    void save(String comic, String chapter, int page, boolean flush) {
        if (comic == null || chapter == null) return;
        try {
            String now=Instant.now().toString();
            String key = key(comic, chapter);
            JSONObject prior = new JSONObject(store.getString(key, "{}"));
            JSONObject value = new JSONObject();
            value.put("comic", comic);
            value.put("chapter", chapter);
            value.put("page", page);
            value.put("revision", prior.optLong("revision", 0) + 1);
            value.put("updatedAt", now);
            value.put("pending", true);
            SharedPreferences.Editor edit = store.edit().putString(key, value.toString())
                .putString("recent:" + prefix + comic, chapter);
            if (flush) edit.commit(); else edit.apply();
            recordHistory(comic,chapter,page,now);
        } catch (Exception e) { throw new IllegalStateException("无法保存阅读进度", e); }
    }

    private void recordHistory(String comic,String chapter,int page,String now){LocalDate day=ReadingHistoryStore.localDay(now);String dayKey=day==null?now.substring(0,Math.min(10,now.length())):day.toString();if(historySessionId.isEmpty()||!dayKey.equals(historyDay)){historySessionId=UUID.randomUUID().toString();historyDay=dayKey;historyStartedAt=now;}UnifiedCatalogStore.Entry entry=UnifiedCatalogStore.load(context).byId.get(comic);String title=entry==null?"漫画":entry.title,author=entry==null?"未知作者":entry.displayAuthor(),provider=entry==null?(EhClient.isEhId(comic)?"eh":("pica".equals(source.kind())?"pica":"")):entry.providerId;ReadingHistoryStore.record(context,historySessionId,comic,chapter,title,author,"章节",provider,source.kind(),page,historyStartedAt,now);}

    synchronized void sync() {
        if (syncing) return;
        syncing = true;
        SYNC.submit(() -> {
            try {
                for (Map.Entry<String, ?> entry : store.getAll().entrySet()) {
                    if (!entry.getKey().startsWith(prefix) || !(entry.getValue() instanceof String)) continue;
                    JSONObject sent = new JSONObject((String) entry.getValue());
                    if (!sent.optBoolean("pending")) continue;
                    try {
                        source.saveProgress(sent.getString("comic"), sent.getString("chapter"), sent.getInt("page"));
                        new android.os.Handler(android.os.Looper.getMainLooper()).post(() -> {
                            try {
                                JSONObject current = new JSONObject(store.getString(entry.getKey(), "{}"));
                                if (ReaderPolicy.acknowledge(sent.getLong("revision"), current.optLong("revision", -1))) {
                                    current.put("pending", false);
                                    store.edit().putString(entry.getKey(), current.toString()).apply();
                                }
                            } catch (Exception ignored) { }
                        });
                    } catch (Exception e) { break; }
                }
            } catch (Exception ignored) { }
            finally { synchronized (ReaderProgress.this) { syncing = false; } }
        });
    }
}
