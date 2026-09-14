package com.picalibrary.android;

import java.util.*;
import org.junit.Test;
import static org.junit.Assert.*;

public class EhFavoriteMigrationTest {
    @Test public void splitLegacyMovesEhAndRetainsOnlyNonEhCacheRows(){
        List<BridgeClient.ComicItem> legacy=Arrays.asList(
            new BridgeClient.ComicItem("pica-1","Pica","A","",0),
            new BridgeClient.ComicItem("eh:123:0123456789","EH","B","",0),
            new BridgeClient.ComicItem("eh:456:abcdef0123","EH2","C","",0)
        );
        EhFavoriteStore.LegacySplit split=EhFavoriteStore.splitLegacy(legacy);
        assertEquals(1,split.remaining.size());
        assertEquals("pica-1",split.remaining.get(0).id);
        assertEquals(new LinkedHashSet<>(Arrays.asList("eh:123:0123456789","eh:456:abcdef0123")),split.localIds);
    }

    @Test public void splitLegacyIsIdempotentOnceLegacyCacheContainsNoEhRows(){
        List<BridgeClient.ComicItem> legacy=Collections.singletonList(new BridgeClient.ComicItem("pica-1","Pica","A","",0));
        EhFavoriteStore.LegacySplit split=EhFavoriteStore.splitLegacy(legacy);
        assertTrue(split.localIds.isEmpty());
        assertEquals(1,split.remaining.size());
    }
}
