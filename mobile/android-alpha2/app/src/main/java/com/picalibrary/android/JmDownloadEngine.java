package com.picalibrary.android;

import android.content.Context;
import java.io.IOException;
import java.util.*;
import org.json.*;

/** Provider-independent orchestration over the existing JM client and phone Reader index. */
final class JmDownloadEngine {
    interface Client {
        void check() throws Exception;
        JSONObject details(String comicId) throws Exception;
        JSONArray episodes(String comicId) throws Exception;
        JSONArray pages(String episodeId) throws Exception;
        byte[] image(String locator) throws Exception;
    }
    interface Listener {
        boolean stopped();
        void progress(String title, String chapter, int done, int total, int pagesDone, int pagesTotal, boolean reused);
    }
    static final class Stopped extends Exception {}
    // Same comic, including all-chapter and single-chapter jobs, cannot write concurrently.
    private static final Object[] LOCKS = new Object[32];
    static { for (int i=0; i<LOCKS.length; i++) LOCKS[i]=new Object(); }
    private JmDownloadEngine() {}

    static void removeCompletedDownload(Context context, String comicId) {
        JmDownloadStore.remote(comicId, "jm:");
        synchronized (LOCKS[(comicId.hashCode() & Integer.MAX_VALUE) % LOCKS.length]) {
            PhoneDownloadStore.remove(context, comicId);
        }
    }

    static void download(Context context, Client client, String comicId, String selected, Listener listener) throws Exception {
        JmDownloadStore.remote(comicId, "jm:");
        if (selected != null && !selected.isEmpty()) JmDownloadStore.remote(selected, "jm-chapter:");
        synchronized (LOCKS[(comicId.hashCode() & Integer.MAX_VALUE) % LOCKS.length]) {
            check(client, listener);
            JSONObject comic = client.details(comicId);
            if (!comicId.equals(comic.optString("comicId"))) throw new IOException("Mismatched JM comic");
            JSONArray all = client.episodes(comicId);
            if (all.length() < 1 || all.length() > 1000) throw new IOException("Invalid JM chapter list");
            List<JSONObject> chapters = new ArrayList<>(); Set<String> seen = new HashSet<>();
            for (int i=0; i<all.length(); i++) {
                JSONObject chapter = all.getJSONObject(i); String id = chapter.getString("id");
                JmDownloadStore.remote(id, "jm-chapter:");
                if (!seen.add(id)) throw new IOException("Duplicate JM chapter");
                if (selected == null || selected.isEmpty() || selected.equals(id)) chapters.add(chapter);
            }
            if (chapters.isEmpty()) throw new IllegalArgumentException("Selected chapter is not part of this comic");
            int done = 0;
            for (JSONObject chapter : chapters) {
                check(client, listener);
                String episodeId = chapter.getString("id"), remote = JmDownloadStore.remote(episodeId, "jm-chapter:");
                JSONArray pages = client.pages(episodeId);
                if (pages.length() < 1 || pages.length() > 3000) throw new IOException("Invalid JM page list");
                // Validate the complete list before writing any page or checkpoint.
                for (int i=0; i<pages.length(); i++) {
                    JSONObject page = pages.getJSONObject(i); String expected = "jm-page:" + remote + ":" + (i+1);
                    if (!expected.equals(page.optString("id")) || !expected.equals(page.optString("url")))
                        throw new IOException("Mismatched JM page locator");
                }
                JmDownloadStore store = new JmDownloadStore(context, comicId, episodeId);
                List<PhoneDownloadStore.Page> stored = new ArrayList<>();
                for (int i=0; i<pages.length(); i++) {
                    check(client, listener);
                    String locator = pages.getJSONObject(i).getString("url"), uri = store.reusable(locator);
                    boolean reused = !uri.isEmpty();
                    if (!reused) {
                        byte[] bytes = client.image(locator); check(client, listener);
                        uri = store.save(locator, i, bytes);
                    }
                    stored.add(new PhoneDownloadStore.Page(i, uri));
                    listener.progress(comic.optString("title"), chapter.optString("title"), done, chapters.size(), i+1, pages.length(), reused);
                }
                check(client, listener);
                PhoneDownloadStore.putChapter(context, comicId, comic.optString("title"), comic.optString("author"),
                        new PhoneDownloadStore.Chapter(episodeId, chapter.optString("title"), chapter.optInt("order", done+1), stored));
                JmClientManager.mergeCatalog(context, new JSONArray().put(comic), false);
                done++;
                listener.progress(comic.optString("title"), chapter.optString("title"), done, chapters.size(), pages.length(), pages.length(), true);
            }
        }
    }

    private static void check(Client client, Listener listener) throws Exception {
        if (listener.stopped() || Thread.currentThread().isInterrupted()) throw new Stopped(); client.check();
    }
}
