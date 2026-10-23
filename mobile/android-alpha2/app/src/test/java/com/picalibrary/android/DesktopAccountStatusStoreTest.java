package com.picalibrary.android;

import static org.junit.Assert.*;
import android.content.Context;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;

@RunWith(RobolectricTestRunner.class)
@Config(sdk=35,application=android.app.Application.class)
public class DesktopAccountStatusStoreTest {
    @Test public void disabledDesktopSourceIsNotAdvertisedAsAnAvailableRelay() throws Exception {
        Context context=RuntimeEnvironment.getApplication();
        DesktopAccountStatusStore.clear(context);
        JSONObject payload=new JSONObject("{\"pica\":{\"configured\":true,\"enabled\":false},\"eh\":{\"configured\":true,\"enabled\":true}}");
        DesktopAccountStatusStore.save(context,payload);
        assertFalse(DesktopAccountStatusStore.load(context).picaConfigured);
        assertTrue(DesktopAccountStatusStore.load(context).ehConfigured);
        // An older Desktop without the additive enabled field still works.
        DesktopAccountStatusStore.save(context,new JSONObject("{\"pica\":{\"configured\":true},\"eh\":{\"configured\":false}}"));
        assertTrue(DesktopAccountStatusStore.load(context).picaConfigured);
        assertFalse(DesktopAccountStatusStore.load(context).ehConfigured);
        DesktopAccountStatusStore.clear(context);
    }
}
