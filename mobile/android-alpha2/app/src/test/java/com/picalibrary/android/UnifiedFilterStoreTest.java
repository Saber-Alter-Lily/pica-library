package com.picalibrary.android;

import static org.junit.Assert.*;
import org.junit.Test;

public class UnifiedFilterStoreTest {
    @Test public void clearResetsFilterGroupsButKeepsSortAuthoritySeparate(){
        UnifiedLibraryFilter.Spec spec=new UnifiedLibraryFilter.Spec();spec.locations.add(UnifiedLibraryFilter.Location.DESKTOP);spec.providers.add(UnifiedLibraryFilter.Provider.PICA);spec.authors.add("A");spec.tags.add("tag");spec.categories.add("cat");spec.favoriteOnly=true;spec.shelfOnly=true;spec.finished=Boolean.TRUE;spec.tagMode=UnifiedLibraryFilter.TagMode.ALL;spec.sort=UnifiedLibraryFilter.Sort.AUTHOR;spec.clear();
        assertTrue(spec.locations.isEmpty());assertTrue(spec.providers.isEmpty());assertTrue(spec.authors.isEmpty());assertTrue(spec.tags.isEmpty());assertTrue(spec.categories.isEmpty());assertFalse(spec.favoriteOnly);assertFalse(spec.shelfOnly);assertNull(spec.finished);assertEquals(UnifiedLibraryFilter.TagMode.ANY,spec.tagMode);assertEquals(UnifiedLibraryFilter.Sort.AUTHOR,spec.sort);
    }
}
