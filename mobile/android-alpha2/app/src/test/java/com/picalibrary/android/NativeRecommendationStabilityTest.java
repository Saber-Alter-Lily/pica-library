package com.picalibrary.android;

import static org.junit.Assert.*;
import java.util.*;
import org.junit.Test;

public final class NativeRecommendationStabilityTest {
    private NativeRecommendationStore.Snapshot ready(String fingerprint){
        NativeRecommendationStore.Snapshot snapshot=new NativeRecommendationStore.Snapshot();
        snapshot.favoriteFingerprint=fingerprint;snapshot.batchIndex=0;
        snapshot.batches.add(new ArrayList<>(Collections.singletonList(new NativeRecommendationStore.Item("comic-1","Title","Author","Reason","FAMILY","intent",1d))));
        return snapshot;
    }

    @Test public void preservesReadyCycleWhenFavoriteFingerprintIsUnchanged(){assertTrue(NativeRecommendationStore.favoriteFingerprintMatches(ready("abc"),"abc"));}
    @Test public void detectsFavoriteFingerprintChange(){assertFalse(NativeRecommendationStore.favoriteFingerprintMatches(ready("abc"),"def"));}
    @Test public void emptyCycleDoesNotCountAsStable(){assertFalse(NativeRecommendationStore.favoriteFingerprintMatches(new NativeRecommendationStore.Snapshot(),"abc"));}
    @Test public void staleFavoriteProfileStillKeepsVisibleBatch(){NativeRecommendationStore.Snapshot snapshot=ready("abc");snapshot.readiness="STALE_FAVORITES";assertTrue(snapshot.available());assertEquals(1,snapshot.current().size());}
}
