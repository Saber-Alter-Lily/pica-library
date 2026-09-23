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

    @Test public void preservesChapterAndVolumeStructure(){
        UnifiedCatalogStore.Entry chapter1=comic("a","Sample Story (Chapter 1)","Artist");
        UnifiedCatalogStore.Entry chapter2=comic("b","Sample Story (Chapter 2)","Artist");
        UnifiedCatalogStore.Entry volume1=comic("c","Example Work Vol. 1 [English]","Artist");
        UnifiedCatalogStore.Entry volume2=comic("d","Example Work Vol. 2 [Digital]","Artist");
        assertTrue(WorkVariantResolver.structureConflict(chapter1,chapter2));
        assertTrue(WorkVariantResolver.structureConflict(volume1,volume2));
    }

    @Test public void sameChapterWithUploadNoiseDoesNotConflict(){
        UnifiedCatalogStore.Entry left=comic("a","Sample Story (Chapter 1) [Chinese]","Artist");
        UnifiedCatalogStore.Entry right=comic("b","Sample Story (Chapter 1) [Digital]","Artist");
        assertFalse(WorkVariantResolver.structureConflict(left,right));
        assertTrue(WorkVariantResolver.titleSimilarity(left,right)>=.90d);
    }

    @Test public void rejectsUnrelatedTitles(){
        UnifiedCatalogStore.Entry a=comic("a","Blue Summer","Artist");
        UnifiedCatalogStore.Entry b=comic("b","Winter Classroom","Artist");
        assertTrue(WorkVariantResolver.titleSimilarity(a,b)<.58d);
    }
}
