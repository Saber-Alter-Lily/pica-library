package com.picalibrary.android;

import static org.junit.Assert.*;
import java.util.*;
import org.junit.Test;

public class AuthorConceptStoreTest {
    @Test public void mergesEhArtistIntoStrongPicaCanonicalIdentity(){
        UnifiedCatalogStore.Snapshot catalog=new UnifiedCatalogStore.Snapshot();UnifiedCatalogStore.Entry pica=new UnifiedCatalogStore.Entry("p1","Pica Work","Circle X (Alice)");pica.providerId="pica";pica.authorId="author_alice";pica.canonicalAuthor="Alice";catalog.byId.put(pica.id,pica);UnifiedCatalogStore.Entry eh=new UnifiedCatalogStore.Entry("eh:1:abcdef1234","EH Work","alice");eh.providerId="eh";catalog.byId.put(eh.id,eh);
        EhSemanticStore.Snapshot semantics=new EhSemanticStore.Snapshot();EhSemanticStore.Record record=new EhSemanticStore.Record(eh.id);record.rawTags.add(new EhSemanticStore.Tag("artist","alice"));record.rawTags.add(new EhSemanticStore.Tag("group","circle x"));semantics.byComicId.put(eh.id,record);
        AuthorConceptStore.Snapshot snapshot=AuthorConceptStore.build(catalog,semantics);AuthorConceptStore.Concept concept=snapshot.get("author_alice");assertNotNull(concept);assertEquals(2,concept.works());assertTrue(concept.hasProvider("pica"));assertTrue(concept.hasProvider("eh"));assertTrue(concept.circles.contains("Circle X")||concept.circles.contains("circle x"));assertEquals("artist:alice",concept.bindingCanonical("eh"));
    }

    @Test public void keepsGroupOnlyIdentitySeparateFromPersonIdentity(){
        UnifiedCatalogStore.Snapshot catalog=new UnifiedCatalogStore.Snapshot();UnifiedCatalogStore.Entry pica=new UnifiedCatalogStore.Entry("p1","Pica Work","Studio A");pica.providerId="pica";catalog.byId.put(pica.id,pica);UnifiedCatalogStore.Entry eh=new UnifiedCatalogStore.Entry("eh:2:abcdef1234","EH Work","studio a");eh.providerId="eh";catalog.byId.put(eh.id,eh);
        EhSemanticStore.Snapshot semantics=new EhSemanticStore.Snapshot();EhSemanticStore.Record record=new EhSemanticStore.Record(eh.id);record.rawTags.add(new EhSemanticStore.Tag("group","studio a"));semantics.byComicId.put(eh.id,record);
        AuthorConceptStore.Snapshot snapshot=AuthorConceptStore.build(catalog,semantics);assertEquals(2,snapshot.all().size());boolean person=false,group=false;for(AuthorConceptStore.Concept concept:snapshot.all()){if(concept.roles.contains("author"))person=true;if(concept.roles.contains("group"))group=true;}assertTrue(person);assertTrue(group);
    }

    @Test public void picaCircleCreatorParsingUsesCreatorAsConceptAndCircleAsMetadata(){
        UnifiedCatalogStore.Snapshot catalog=new UnifiedCatalogStore.Snapshot();UnifiedCatalogStore.Entry pica=new UnifiedCatalogStore.Entry("p1","Work","Moon (Alice)");pica.providerId="pica";catalog.byId.put(pica.id,pica);AuthorConceptStore.Snapshot snapshot=AuthorConceptStore.build(catalog,new EhSemanticStore.Snapshot());AuthorConceptStore.Concept concept=snapshot.all().get(0);assertEquals("Alice",concept.canonicalName);assertTrue(concept.circles.contains("Moon"));assertTrue(concept.aliases.contains("Moon (Alice)"));
    }
}
