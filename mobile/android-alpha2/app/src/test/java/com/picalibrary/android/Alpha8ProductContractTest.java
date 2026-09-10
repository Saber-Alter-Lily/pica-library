package com.picalibrary.android;

import org.junit.Test;
import java.util.*;
import static org.junit.Assert.*;

/** Product-level regression gates for the Alpha8.x convergence. */
public class Alpha8ProductContractTest {
    @Test public void unifiedShellKeepsSourcesBehindComicFirstUi() {
        assertArrayEquals(new String[]{"书库","推荐","在线","连接"}, ShellPolicy.bottomTabs());
        for (String tab : ShellPolicy.bottomTabs()) {
            assertNotEquals("电脑", tab);
            assertNotEquals("云端", tab);
            assertNotEquals("Pica", tab);
            assertNotEquals("图鉴", tab);
            assertNotEquals("历史", tab);
        }
    }

    @Test public void readerSourcePriorityMatchesUnifiedResolverContract() {
        assertEquals(
            Arrays.asList(
                SourcePolicy.Kind.PHONE_DOWNLOAD,
                SourcePolicy.Kind.PHONE_CACHE,
                SourcePolicy.Kind.DESKTOP_LAN,
                SourcePolicy.Kind.REMOTE_STORAGE,
                SourcePolicy.Kind.PICA_ONLINE
            ),
            SourcePolicy.readerOrder(true, true, true, true)
        );
        assertEquals(
            Arrays.asList(SourcePolicy.Kind.PHONE_CACHE, SourcePolicy.Kind.PICA_ONLINE),
            SourcePolicy.readerOrder(false, false, false, true)
        );
    }

    @Test public void pageCacheHasAllPromisedUserLimits() {
        assertArrayEquals(new long[]{256,512,1024,2048,5120,10240,StorageSettings.UNLIMITED},StorageSettings.PAGE_MB);
        assertEquals(1024, StorageSettings.DEFAULT_PAGE_MB);
    }

    @Test public void coverCacheHasAllPromisedUserLimits() {
        assertArrayEquals(new long[]{64,128,256,512,1024,StorageSettings.UNLIMITED},StorageSettings.COVER_MB);
        assertEquals(256, StorageSettings.DEFAULT_COVER_MB);
    }

    @Test public void readerPrefetchHasAllPromisedLevels() {
        assertArrayEquals(new int[]{0,1,2,3,5,10}, StorageSettings.PREFETCH);
        assertEquals(3, StorageSettings.DEFAULT_PREFETCH);
    }

    @Test public void desktopIsNotRequiredWhenCloudOrPicaExists() {
        assertTrue(SourcePolicy.canReadWithoutDesktop(true, false));
        assertTrue(SourcePolicy.canReadWithoutDesktop(false, true));
        assertFalse(SourcePolicy.canReadWithoutDesktop(false, false));
    }

    @Test public void collectionModesLockListAndTwoThreeFiveGrid() {
        assertEquals(0, UnifiedComicCollectionAdapter.MODE_LIST);
        assertEquals(2, UnifiedComicCollectionAdapter.MODE_GRID_LARGE);
        assertEquals(3, UnifiedComicCollectionAdapter.MODE_GRID_MEDIUM);
        assertEquals(5, UnifiedComicCollectionAdapter.MODE_GRID_SMALL);
    }
}
