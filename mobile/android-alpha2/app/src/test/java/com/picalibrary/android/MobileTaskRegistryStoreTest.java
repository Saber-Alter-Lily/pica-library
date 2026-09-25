package com.picalibrary.android;

import static org.junit.Assert.*;

import android.content.Context;
import java.util.*;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 35)
public class MobileTaskRegistryStoreTest {
    private Context app;

    @Before public void reset() {
        app = RuntimeEnvironment.getApplication();
        app.getSharedPreferences("background-task-registry-v1", Context.MODE_PRIVATE)
            .edit().clear().commit();
    }

    @Test public void downloadRegistryPersistsAndReplacesCurrentWorkId() {
        UUID first = UUID.randomUUID();
        MobileTaskRegistryStore.registerDownload(app,"pica","comic-1","episode-1",first);

        List<MobileTaskRegistryStore.DownloadRef> initial = MobileTaskRegistryStore.downloads(app);
        assertEquals(1, initial.size());
        assertEquals("pica", initial.get(0).provider);
        assertEquals("comic-1", initial.get(0).comicId);
        assertEquals("episode-1", initial.get(0).episodeId);
        assertEquals(first.toString(), initial.get(0).workId);

        UUID replacement = UUID.randomUUID();
        MobileTaskRegistryStore.registerDownload(app,"pica","comic-1","episode-1",replacement);

        List<MobileTaskRegistryStore.DownloadRef> replaced = MobileTaskRegistryStore.downloads(app);
        assertEquals(1, replaced.size());
        assertEquals(replacement.toString(), replaced.get(0).workId);

        MobileTaskRegistryStore.unregisterDownload(app,"pica","comic-1","episode-1");
        assertTrue(MobileTaskRegistryStore.downloads(app).isEmpty());
    }

    @Test public void singletonWorkIdSurvivesFreshStoreReads() {
        UUID workId = UUID.randomUUID();
        MobileTaskRegistryStore.setWorkId(app,"recommendation","native-recommendation-v3",workId);

        assertEquals(
            workId.toString(),
            MobileTaskRegistryStore.workId(app,"recommendation","native-recommendation-v3")
        );

        MobileTaskRegistryStore.clearWorkId(app,"recommendation","native-recommendation-v3");
        assertEquals(
            "",
            MobileTaskRegistryStore.workId(app,"recommendation","native-recommendation-v3")
        );
    }

    @Test public void picaAndEhDownloadIdentitiesRemainDistinct() {
        UUID pica = UUID.randomUUID();
        UUID eh = UUID.randomUUID();
        MobileTaskRegistryStore.registerDownload(app,"pica","same-id","",pica);
        MobileTaskRegistryStore.registerDownload(app,"eh","same-id","",eh);

        List<MobileTaskRegistryStore.DownloadRef> refs = MobileTaskRegistryStore.downloads(app);
        assertEquals(2, refs.size());
        Set<String> providers = new HashSet<>();
        for (MobileTaskRegistryStore.DownloadRef ref : refs) providers.add(ref.provider);
        assertTrue(providers.contains("pica"));
        assertTrue(providers.contains("eh"));
    }
}
