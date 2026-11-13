package com.picalibrary.android;

import static org.junit.Assert.*;
import android.content.Context;
import java.util.ServiceLoader;
import io.github.jukomu.jmcomic.core.image.spi.ImageProcessor;
import org.json.*;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;
import org.robolectric.annotation.Implements;
import org.robolectric.annotation.Implementation;

@RunWith(RobolectricTestRunner.class)
@Config(sdk=35,shadows=JmCatalogIntegrationTest.PosixAtomicRename.class)
public class JmCatalogIntegrationTest {
    /** Android rename replaces a file. Java File.renameTo on a Windows test host does not.
     * Keep production AtomicFile unchanged; emulate only the POSIX rename step in this fixture.
     * This is not a physical-device crash-durability test.
     */
    @Implements(android.util.AtomicFile.class)
    public static class PosixAtomicRename {
        @Implementation protected static void rename(java.io.File source,java.io.File target) {
            try {java.nio.file.Files.move(source.toPath(),target.toPath(),java.nio.file.StandardCopyOption.REPLACE_EXISTING);}
            catch(java.io.IOException error){throw new IllegalStateException("Synthetic AtomicFile rename failed",error);}
        }
    }
    @Test public void enrichedMetadataAndFavoriteProvenanceSurviveSummaryRefresh() throws Exception {
        Context context=RuntimeEnvironment.getApplication();
        JSONObject detail=new JSONObject("{\"comicId\":\"jm:123\",\"providerRemoteId\":\"123\",\"title\":\"Fixture\",\"author\":\"Writer\",\"description\":\"Detailed\",\"tags\":[\"story\"],\"pagesCount\":24,\"providerMetadata\":{\"metadataCompleteness\":\"DETAIL\"}}");
        JmClientManager.mergeCatalog(context,new JSONArray().put(detail),false);
        assertTrue("detail flag persisted before refresh",UnifiedCatalogStore.load(context).byId.get("jm:123").jmMetadataComplete);
        JSONObject summary=new JSONObject("{\"comicId\":\"jm:123\",\"title\":\"Fixture\",\"author\":\"\",\"tags\":[],\"providerMetadata\":{\"metadataCompleteness\":\"SUMMARY\"}}");
        JmClientManager.mergeCatalog(context,new JSONArray().put(summary),true);
        UnifiedCatalogStore.Entry entry=UnifiedCatalogStore.load(context).byId.get("jm:123");
        assertTrue("favorite",entry.favorite);
        assertTrue("jmFavorite",entry.jmFavorite);
        assertTrue("jmMetadataComplete",entry.jmMetadataComplete);
        assertFalse(entry.picaFavorite);assertEquals("Writer",entry.author);assertTrue(entry.tags.contains("story"));assertEquals(24,entry.knownPictures);
    }
    @Test public void foreignNamespaceCannotEnterJmCatalog() throws Exception {
        Context context=RuntimeEnvironment.getApplication();
        assertThrows(IllegalArgumentException.class,()->JmClientManager.mergeCatalog(context,new JSONArray("[{\"comicId\":\"raw-pica-id\"}]"),true));
        assertFalse(UnifiedCatalogStore.load(context).byId.containsKey("raw-pica-id"));
    }
    @Test public void packagedSdkSelectsNativeAndroidImageProcessorInsteadOfAwt() {
        ImageProcessor processor=ServiceLoader.load(ImageProcessor.class).iterator().next();
        assertTrue(processor.getClass().getName(),processor.getClass().getName().contains("AndroidImageProcessor"));
    }
}
