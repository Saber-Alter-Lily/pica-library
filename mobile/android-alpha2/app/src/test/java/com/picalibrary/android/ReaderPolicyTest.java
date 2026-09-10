package com.picalibrary.android;

import org.junit.Test;
import static org.junit.Assert.*;

public class ReaderPolicyTest {
    @Test public void emptyChapterHasNoNegativePosition() { assertEquals(0, ReaderPolicy.clampPage(19, 0)); }
    @Test public void shortenedChapterClampsRestoredProgress() { assertEquals(4, ReaderPolicy.clampPage(99, 5)); }
    @Test public void negativeRemoteProgressClampsToStart() { assertEquals(0, ReaderPolicy.clampPage(-3, 10)); }
    @Test public void cacheKeysSeparateAccountsAndServers() { assertNotEquals(ReaderPolicy.hash("host-a\ntoken-a"), ReaderPolicy.hash("host-a\ntoken-b")); }
    @Test public void ordinaryPagePreservesReadableResolution() { assertEquals(1, ReaderPolicy.sampleSize(1200, 1800, 1080)); }
    @Test public void oversizedImageHasBoundedDecodedPixels() { int s = ReaderPolicy.sampleSize(4000, 40000, 1080); assertTrue((long)(4000/s)*(40000/s) <= 8_000_000); }
    @Test public void persistentPhoneUrisAreRecognizedAsLocal() { assertTrue(ReaderPolicy.isLocalPageUri("content://downloads/page"));assertTrue(ReaderPolicy.isLocalPageUri("file:///storage/page.jpg")); }
    @Test public void networkPagesAreNotTreatedAsPersistentLocalFiles() { assertFalse(ReaderPolicy.isLocalPageUri("https://example.test/page.jpg"));assertFalse(ReaderPolicy.isLocalPageUri(null)); }
    @Test public void oldAckCannotEraseNewPendingBookmark() { assertFalse(ReaderPolicy.acknowledge(8, 9)); }
    @Test public void matchingAckCanClearPendingBookmark() { assertTrue(ReaderPolicy.acknowledge(9, 9)); }
}
