package com.picalibrary.android.remote;

import android.os.ParcelFileDescriptor;

/**
 * Signature-protected first-party Reader <-> optional user-owned Host ABI.
 * The original Reader never executes a remote plugin or makes a network call.
 * Only opaque owned identifiers and file descriptors cross this boundary.
 */
interface ISourceEndpoint {
    int protocolVersion();
    String sessionScope();
    String chapters(String comicId);
    String chapter(String comicId, String episodeId);
    ParcelFileDescriptor openPage(String opaquePageLocator);
    // Append v2 method so transaction IDs of the v1 ABI stay unchanged.
    ParcelFileDescriptor openChapterList(String comicId);
}
