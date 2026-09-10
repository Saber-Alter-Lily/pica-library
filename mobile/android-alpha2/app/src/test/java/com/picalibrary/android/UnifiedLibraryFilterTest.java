package com.picalibrary.android;

import static org.junit.Assert.*;
import java.util.*;
import org.junit.Test;

public class UnifiedLibraryFilterTest {
    private UnifiedCatalogStore.Entry entry(String id,String title,String author,String... tags){UnifiedCatalogStore.Entry e=new UnifiedCatalogStore.Entry(id,title,author);e.canonicalAuthor=author;e.tags.addAll(Arrays.asList(tags));return e;}

    @Test public void combinesGroupsAndOrsSources(){UnifiedCatalogStore.Entry a=entry("a","Alpha","Author A","romance","school");a.desktopDownloaded=true;a.favorite=true;UnifiedCatalogStore.Entry b=entry("b","Beta","Author A","romance");b.remoteAvailable=true;UnifiedCatalogStore.Entry c=entry("c","Gamma","Author B","action");c.picaAvailable=true;c.favorite=true;UnifiedLibraryFilter.Spec spec=new UnifiedLibraryFilter.Spec();spec.sources.add(UnifiedLibraryFilter.Source.DESKTOP);spec.sources.add(UnifiedLibraryFilter.Source.WEBDAV);spec.favoriteOnly=true;List<UnifiedCatalogStore.Entry> out=UnifiedLibraryFilter.apply(Arrays.asList(a,b,c),spec);assertEquals(1,out.size());assertEquals("a",out.get(0).id);}

    @Test public void supportsTagAnyAndAll(){UnifiedCatalogStore.Entry a=entry("a","Alpha","Author A","romance","school");UnifiedCatalogStore.Entry b=entry("b","Beta","Author B","romance");UnifiedLibraryFilter.Spec spec=new UnifiedLibraryFilter.Spec();spec.tags.add("romance");spec.tags.add("school");assertEquals(2,UnifiedLibraryFilter.apply(Arrays.asList(a,b),spec).size());spec.tagMode=UnifiedLibraryFilter.TagMode.ALL;List<UnifiedCatalogStore.Entry> all=UnifiedLibraryFilter.apply(Arrays.asList(a,b),spec);assertEquals(1,all.size());assertEquals("a",all.get(0).id);}

    @Test public void searchesAuthorTagsAndCategoriesAndBuildsFacets(){UnifiedCatalogStore.Entry a=entry("a","Alpha","Circle A","romance");a.categories.add("短篇");UnifiedCatalogStore.Entry b=entry("b","Beta","Circle B","action");b.categories.add("长篇");UnifiedLibraryFilter.Spec spec=new UnifiedLibraryFilter.Spec();spec.text="短篇";assertEquals("a",UnifiedLibraryFilter.apply(Arrays.asList(a,b),spec).get(0).id);UnifiedLibraryFilter.Facets facets=UnifiedLibraryFilter.facets(Arrays.asList(a,b));assertEquals(2,facets.authors.size());assertEquals(2,facets.tags.size());assertEquals(2,facets.categories.size());}

    @Test public void activeCountCountsVisibleFilterGroupsNotIntrinsicFavoriteMembership(){UnifiedLibraryFilter.Spec spec=new UnifiedLibraryFilter.Spec();spec.sources.add(UnifiedLibraryFilter.Source.DESKTOP);spec.sources.add(UnifiedLibraryFilter.Source.WEBDAV);spec.tags.add("a");spec.tags.add("b");spec.favoriteOnly=true;spec.sort=UnifiedLibraryFilter.Sort.TITLE;assertEquals(3,spec.activeCount());}

    @Test public void sourceFiltersUseMergedAvailability(){UnifiedCatalogStore.Entry a=entry("a","Alpha","Author");a.desktopDownloaded=true;a.remoteAvailable=true;UnifiedLibraryFilter.Spec spec=new UnifiedLibraryFilter.Spec();spec.sources.add(UnifiedLibraryFilter.Source.WEBDAV);assertEquals(1,UnifiedLibraryFilter.apply(Collections.singletonList(a),spec).size());spec.sources.clear();spec.sources.add(UnifiedLibraryFilter.Source.PHONE);assertEquals(0,UnifiedLibraryFilter.apply(Collections.singletonList(a),spec).size());}

    @Test public void picaSourceCanBeFilteredWithoutDuplicatingComic(){UnifiedCatalogStore.Entry a=entry("a","Alpha","Author");a.desktopDownloaded=true;a.picaAvailable=true;UnifiedLibraryFilter.Spec spec=new UnifiedLibraryFilter.Spec();spec.sources.add(UnifiedLibraryFilter.Source.PICA);List<UnifiedCatalogStore.Entry> out=UnifiedLibraryFilter.apply(Collections.singletonList(a),spec);assertEquals(1,out.size());assertEquals("a",out.get(0).id);spec.sources.add(UnifiedLibraryFilter.Source.WEBDAV);assertEquals(1,UnifiedLibraryFilter.apply(Collections.singletonList(a),spec).size());}
}
