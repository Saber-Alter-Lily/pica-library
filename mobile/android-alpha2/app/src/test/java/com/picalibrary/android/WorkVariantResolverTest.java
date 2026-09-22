package com.picalibrary.android;

import static org.junit.Assert.*;
import org.junit.Test;

public class WorkVariantResolverTest {
    private UnifiedCatalogStore.Entry comic(String id,String title,String author,String... alternates){
        UnifiedCatalogStore.Entry entry=new UnifiedCatalogStore.Entry(id,title,author);
        for(String value:alternates)entry.alternateTitles.add(value);
        return entry;
    }

    @Test public void normalizesUploadNoiseInsideCreatorBucket(){
        UnifiedCatalogStore.Entry pica=comic("p1","盗まれた人妻。","平つくね");
        UnifiedCatalogStore.Entry eh=comic(
            "eh:1:abc",
            "[ROUTE1 (Taira Tsukune)] Nusumareta Hitozuma. - Stolen Wife [Digital]",
            "taira tsukune",
            "[ROUTE1 (平つくね)] 盗まれた人妻。[DL版]"
        );
        assertTrue(WorkVariantResolver.titleSimilarity(pica,eh)>=.90d);
    }

    @Test public void keepsMinorRetitleAsReviewCandidate(){
        UnifiedCatalogStore.Entry a=comic("a","Example Work - Special","Artist");
        UnifiedCatalogStore.Entry b=comic("b","Example Work","Artist");
        double score=WorkVariantResolver.titleSimilarity(a,b);
        assertTrue(score>=.68d);
        assertTrue(score<1d);
    }

    @Test public void rejectsUnrelatedTitles(){
        UnifiedCatalogStore.Entry a=comic("a","Blue Summer","Artist");
        UnifiedCatalogStore.Entry b=comic("b","Winter Classroom","Artist");
        assertTrue(WorkVariantResolver.titleSimilarity(a,b)<.58d);
    }
}
