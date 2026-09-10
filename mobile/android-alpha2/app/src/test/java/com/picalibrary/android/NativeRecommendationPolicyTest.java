package com.picalibrary.android;

import org.junit.Test;
import static org.junit.Assert.*;

public class NativeRecommendationPolicyTest {
    @Test public void conjunctionUsesDesktopThresholds(){assertFalse(NativeRecommendationPolicy.conjunctionEligible(100,20,20,4));assertTrue(NativeRecommendationPolicy.conjunctionEligible(100,20,20,6));assertFalse(NativeRecommendationPolicy.conjunctionEligible(100,50,50,6));}
    @Test public void frozenNeutralDirectWeightsStayStable(){assertEquals(0.355,NativeRecommendationPolicy.frozenNeutralScore(1,1,1,1),0.000001);assertEquals(0.04,NativeRecommendationPolicy.frozenNeutralScore(0,0,0,0),0.000001);}
    @Test public void readinessMatchesDesktopRetriever(){assertEquals("FAILED_INSUFFICIENT_POOL",NativeRecommendationPolicy.readiness(11));assertEquals("READY_LIMITED",NativeRecommendationPolicy.readiness(12));assertEquals("READY_DEGRADED",NativeRecommendationPolicy.readiness(48));assertEquals("READY",NativeRecommendationPolicy.readiness(180));}
    @Test public void familyPriorityMatchesDesktopAllocator(){assertTrue(NativeRecommendationPolicy.familyRank("FANDOM")<NativeRecommendationPolicy.familyRank("CREATOR"));assertTrue(NativeRecommendationPolicy.familyRank("CREATOR")<NativeRecommendationPolicy.familyRank("SEMANTIC_CONJUNCTION"));assertTrue(NativeRecommendationPolicy.familyRank("SEMANTIC_CONJUNCTION")<NativeRecommendationPolicy.familyRank("SEMANTIC_ANCHOR"));assertTrue(NativeRecommendationPolicy.familyRank("SEMANTIC_ANCHOR")<NativeRecommendationPolicy.familyRank("EXPLORATION"));assertTrue(NativeRecommendationPolicy.familyRank("EXPLORATION")<NativeRecommendationPolicy.familyRank("RELATED"));}
    @Test public void desktopBatchBoundsAreRetained(){assertEquals(250,NativeRecommendationPolicy.TARGET_POOL);assertEquals(24,NativeRecommendationPolicy.MAX_PROVIDER_REQUESTS);assertEquals(3,NativeRecommendationPolicy.MAX_PAGE);assertEquals(12,NativeRecommendationPolicy.BATCH_SIZE);assertEquals(6,NativeRecommendationPolicy.MAX_BATCHES);}
}