package com.picalibrary.android;

import static org.junit.Assert.*;
import java.util.*;
import org.junit.Test;

public class UnifiedFilterStoreTest {
    @Test public void clearResetsGroupedFilters(){
        UnifiedLibraryFilter.Spec spec=new UnifiedLibraryFilter.Spec();spec.sources.add(UnifiedLibraryFilter.Source.DESKTOP);spec.authors.add("A");spec.tags.add("tag");spec.categories.add("cat");spec.favoriteOnly=true;spec.shelfOnly=true;spec.finished=Boolean.TRUE;spec.tagMode=UnifiedLibraryFilter.TagMode.ALL;spec.sort=UnifiedLibraryFilter.Sort.AUTHOR;spec.clear();
        assertTrue(spec.sources.isEmpty());assertTrue(spec.authors.isEmpty());assertTrue(spec.tags.isEmpty());assertTrue(spec.categories.isEmpty());assertFalse(spec.favoriteOnly);assertFalse(spec.shelfOnly);assertNull(spec.finished);assertEquals(UnifiedLibraryFilter.TagMode.ANY,spec.tagMode);assertEquals(UnifiedLibraryFilter.Sort.LATEST,spec.sort);
    }
}
