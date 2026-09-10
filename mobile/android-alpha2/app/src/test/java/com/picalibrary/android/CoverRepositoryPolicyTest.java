package com.picalibrary.android;

import static org.junit.Assert.*;
import java.lang.reflect.Method;
import org.junit.Test;

public class CoverRepositoryPolicyTest {
    private String key(UnifiedCatalogStore.Entry entry) throws Exception {Method method=CoverRepository.class.getDeclaredMethod("key",UnifiedCatalogStore.Entry.class);method.setAccessible(true);return (String)method.invoke(null,entry);}

    @Test public void sameComicMetadataKeepsStableCoverIdentity() throws Exception {UnifiedCatalogStore.Entry entry=new UnifiedCatalogStore.Entry("comic","Title","Author");entry.desktopCoverPath="/mobile/v1/covers/comic";entry.updatedAt="2026-09-09T00:00:00Z";assertEquals(key(entry),key(entry));}

    @Test public void providerCoverPathChangeInvalidatesIdentity() throws Exception {UnifiedCatalogStore.Entry before=new UnifiedCatalogStore.Entry("comic","Title","Author");before.remoteCoverPath="v1/comics/comic/cover.jpg";before.updatedAt="2026-09-09T00:00:00Z";UnifiedCatalogStore.Entry after=new UnifiedCatalogStore.Entry("comic","Title","Author");after.remoteCoverPath="v1/comics/comic/cover.webp";after.updatedAt=before.updatedAt;assertNotEquals(key(before),key(after));}

    @Test public void catalogRevisionInvalidatesStablePath() throws Exception {UnifiedCatalogStore.Entry before=new UnifiedCatalogStore.Entry("comic","Title","Author");before.desktopCoverPath="/mobile/v1/covers/comic";before.updatedAt="2026-09-09T00:00:00Z";UnifiedCatalogStore.Entry after=new UnifiedCatalogStore.Entry("comic","Title","Author");after.desktopCoverPath=before.desktopCoverPath;after.updatedAt="2026-09-10T00:00:00Z";assertNotEquals(key(before),key(after));}
}
