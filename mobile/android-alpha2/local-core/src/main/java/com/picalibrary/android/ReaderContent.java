package com.picalibrary.android;

import java.util.List;

/**
 * Source-independent chapter and page values shared by the existing Reader,
 * Android-local imports, and optional online source adapters.
 * No Android runtime, BridgeClient, provider, network or external library.
 */
public final class ReaderContent {
    private ReaderContent() {}

    public static class Chapter {
        public final String id, title;
        public final int order, downloadedPictures;
        public Chapter(String id, String title, int order, int downloadedPictures) {
            this.id=id; this.title=title; this.order=order;
            this.downloadedPictures=downloadedPictures;
        }
    }

    public static class Page {
        public final String id, url;
        public final int position;
        public Page(String id, String url, int position) {
            this.id=id; this.url=url; this.position=position;
        }
    }

    public static class ChapterData {
        public final Chapter episode;
        public final List<? extends Page> pages;
        public final int progressIndex;
        public ChapterData(Chapter episode, List<? extends Page> pages, int progressIndex) {
            this.episode=episode; this.pages=pages; this.progressIndex=progressIndex;
        }
    }
}
