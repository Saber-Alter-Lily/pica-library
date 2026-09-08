package com.picalibrary.android;

import android.net.Uri;

/** Canonical provider-neutral remote library layout shared with Desktop Alpha7. */
final class RemoteLibraryPaths {
    static final String ROOT = "v1";
    static final String CURRENT = ROOT + "/control/current.json";

    private RemoteLibraryPaths() {}

    static String id(String value) {
        if (value == null || value.trim().isEmpty()) throw new IllegalArgumentException("id is empty");
        return Uri.encode(value.trim());
    }

    static String generation(String generation) {
        return ROOT + "/index/generations/" + id(generation) + ".json";
    }

    static String comicRoot(String comicId) {
        return ROOT + "/comics/" + id(comicId);
    }

    static String comicManifest(String comicId) {
        return comicRoot(comicId) + "/manifest.json";
    }

    static String episodeRoot(String comicId, String episodeId) {
        return comicRoot(comicId) + "/episodes/" + id(episodeId);
    }

    static String episodeManifest(String comicId, String episodeId) {
        return episodeRoot(comicId, episodeId) + "/manifest.json";
    }

    static String page(String comicId, String episodeId, int pageIndex, String extension) {
        if (pageIndex < 0) throw new IllegalArgumentException("pageIndex is invalid");
        String ext = extension == null ? "jpg" : extension.replaceFirst("^\\.", "").toLowerCase();
        if (!ext.matches("[a-z0-9]{2,8}")) throw new IllegalArgumentException("unsafe extension");
        return episodeRoot(comicId, episodeId) + "/pages/" + String.format(java.util.Locale.ROOT, "%06d", pageIndex + 1) + "." + ext;
    }
}
