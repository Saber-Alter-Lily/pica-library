package com.picalibrary.android;

import static org.junit.Assert.*;
import java.util.*;
import org.junit.Test;

public class UnifiedLibraryFilterTest {
    @Test public void repeatedlySelectingRandomUsesAStableLocalOrder(){LibraryShuffleExamples.main(new String[0]);}

    @Test public void randomAfterFilteringDoesNotChangeMembershipAndClearingFiltersKeepsTheSeed(){
        UnifiedCatalogStore.Entry a=entry("a","A","author","selected"), b=entry("b","B","author","selected"), c=entry("c","C","author","other");
        List<UnifiedCatalogStore.Entry> source=Arrays.asList(a,b,c);
        UnifiedLibraryFilter.Spec spec=new UnifiedLibraryFilter.Spec();spec.tags.add("selected");spec.sort=UnifiedLibraryFilter.Sort.RANDOM;
        spec.shuffle=spec.shuffle.reroll(Arrays.asList("a","b"),new Random(2));
        assertEquals(Arrays.asList(b,a),UnifiedLibraryFilter.apply(source,spec));
        UnifiedLibraryFilter.Spec copy=spec.copy();copy.clear();assertEquals(spec.shuffle.seed,copy.shuffle.seed);
        List<UnifiedCatalogStore.Entry> all=UnifiedLibraryFilter.apply(source,copy);assertEquals(3,all.size());
        assertTrue(all.indexOf(b)<all.indexOf(a));assertEquals(Arrays.asList(a,b,c),source);
        copy.sort=UnifiedLibraryFilter.Sort.TITLE;assertEquals(source,UnifiedLibraryFilter.apply(source,copy));
    }
    private UnifiedCatalogStore.Entry entry(String id,String title,String author,String... tags){UnifiedCatalogStore.Entry e=new UnifiedCatalogStore.Entry(id,title,author);e.canonicalAuthor=author;e.tags.addAll(Arrays.asList(tags));return e;}

    @Test public void combinesLocationGroupWithFavoriteConstraint(){UnifiedCatalogStore.Entry a=entry("a","Alpha","Author A","romance","school");a.desktopDownloaded=true;a.favorite=true;UnifiedCatalogStore.Entry b=entry("b","Beta","Author A","romance");b.remoteAvailable=true;UnifiedCatalogStore.Entry c=entry("c","Gamma","Author B","action");c.picaAvailable=true;c.favorite=true;UnifiedLibraryFilter.Spec spec=new UnifiedLibraryFilter.Spec();spec.locations.add(UnifiedLibraryFilter.Location.DESKTOP);spec.locations.add(UnifiedLibraryFilter.Location.WEBDAV);spec.favoriteOnly=true;List<UnifiedCatalogStore.Entry> out=UnifiedLibraryFilter.apply(Arrays.asList(a,b,c),spec);assertEquals(1,out.size());assertEquals("a",out.get(0).id);}

    @Test public void supportsTagAnyAndAll(){UnifiedCatalogStore.Entry a=entry("a","Alpha","Author A","romance","school");UnifiedCatalogStore.Entry b=entry("b","Beta","Author B","romance");UnifiedLibraryFilter.Spec spec=new UnifiedLibraryFilter.Spec();spec.tags.add("romance");spec.tags.add("school");assertEquals(2,UnifiedLibraryFilter.apply(Arrays.asList(a,b),spec).size());spec.tagMode=UnifiedLibraryFilter.TagMode.ALL;List<UnifiedCatalogStore.Entry> all=UnifiedLibraryFilter.apply(Arrays.asList(a,b),spec);assertEquals(1,all.size());assertEquals("a",all.get(0).id);}

    @Test public void searchesAuthorTagsAndCategoriesAndBuildsFacets(){UnifiedCatalogStore.Entry a=entry("a","Alpha","Circle A","romance");a.categories.add("短篇");UnifiedCatalogStore.Entry b=entry("b","Beta","Circle B","action");b.categories.add("长篇");UnifiedLibraryFilter.Spec spec=new UnifiedLibraryFilter.Spec();spec.text="短篇";assertEquals("a",UnifiedLibraryFilter.apply(Arrays.asList(a,b),spec).get(0).id);UnifiedLibraryFilter.Facets facets=UnifiedLibraryFilter.facets(Arrays.asList(a,b));assertEquals(2,facets.authors.size());assertEquals(2,facets.tags.size());assertEquals(2,facets.categories.size());}

    @Test public void activeCountExcludesSortAndCountsOrthogonalGroups(){UnifiedLibraryFilter.Spec spec=new UnifiedLibraryFilter.Spec();spec.locations.add(UnifiedLibraryFilter.Location.DESKTOP);spec.locations.add(UnifiedLibraryFilter.Location.WEBDAV);spec.providers.add(UnifiedLibraryFilter.Provider.PICA);spec.tags.add("a");spec.tags.add("b");spec.favoriteOnly=true;spec.sort=UnifiedLibraryFilter.Sort.TITLE;assertEquals(3,spec.activeCount());}

    @Test public void locationFiltersUseMergedAvailability(){UnifiedCatalogStore.Entry a=entry("a","Alpha","Author");a.desktopDownloaded=true;a.remoteAvailable=true;UnifiedLibraryFilter.Spec spec=new UnifiedLibraryFilter.Spec();spec.locations.add(UnifiedLibraryFilter.Location.WEBDAV);assertEquals(1,UnifiedLibraryFilter.apply(Collections.singletonList(a),spec).size());spec.locations.clear();spec.locations.add(UnifiedLibraryFilter.Location.PHONE);assertEquals(0,UnifiedLibraryFilter.apply(Collections.singletonList(a),spec).size());}

    @Test public void providerFiltersAreIndependentOfReplicaLocation(){UnifiedCatalogStore.Entry pica=entry("a","Alpha","Author");pica.desktopDownloaded=true;pica.picaAvailable=true;pica.sourceBindings.add("pica");UnifiedCatalogStore.Entry eh=entry("eh:1:abcdef1234","Beta","Author");eh.ehAvailable=true;eh.sourceBindings.add("eh");UnifiedCatalogStore.Entry exh=entry("eh:2:abcdef1234","Gamma","Author");exh.ehAvailable=true;exh.sourceBindings.add("exh");UnifiedLibraryFilter.Spec spec=new UnifiedLibraryFilter.Spec();spec.locations.add(UnifiedLibraryFilter.Location.ONLINE);spec.providers.add(UnifiedLibraryFilter.Provider.EH);List<UnifiedCatalogStore.Entry> out=UnifiedLibraryFilter.apply(Arrays.asList(pica,eh,exh),spec);assertEquals(1,out.size());assertEquals(eh.id,out.get(0).id);spec.providers.clear();spec.providers.add(UnifiedLibraryFilter.Provider.EXH);out=UnifiedLibraryFilter.apply(Arrays.asList(pica,eh,exh),spec);assertEquals(1,out.size());assertEquals(exh.id,out.get(0).id);}
}
