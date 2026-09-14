package com.picalibrary.android;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

public class RemoteConfigStoreTest {
    @Test public void normalizes123PanHostRootToWebDavEndpoint(){
        RemoteConfigStore.Config config=RemoteConfigStore.candidate(
                "https://webdav.123pan.cn/",
                "PicaLibrary",
                "user",
                "app-password",
                null
        );
        assertEquals("https://webdav.123pan.cn/webdav",config.baseUrl);
        assertEquals("123pan",config.vendor);
    }

    @Test public void preservesExplicit123PanWebDavEndpoint(){
        RemoteConfigStore.Config config=RemoteConfigStore.candidate(
                "https://webdav.123pan.cn/webdav/",
                "PicaLibrary",
                "user",
                "app-password",
                null
        );
        assertEquals("https://webdav.123pan.cn/webdav",config.baseUrl);
    }

    @Test public void normalizesProviderSpecificRootPaths(){
        assertEquals("https://dav.jianguoyun.com/dav",RemoteConfigStore.normalizeBaseUrl("https://dav.jianguoyun.com/"));
        assertEquals("https://app.koofr.net/dav/Koofr",RemoteConfigStore.normalizeBaseUrl("https://app.koofr.net/"));
    }

    @Test public void keepsTargetIdentityAndIndependentProviderMetadata(){
        RemoteConfigStore.Config config=RemoteConfigStore.candidate(
                "remote-a",
                "我的坚果云",
                "jianguoyun",
                "https://dav.jianguoyun.com",
                "PicaLibrary",
                "me@example.com",
                "app-password",
                null
        );
        assertEquals("remote-a",config.id);
        assertEquals("我的坚果云",config.label);
        assertEquals("jianguoyun",config.vendor);
        assertEquals("https://dav.jianguoyun.com/dav",config.baseUrl);
    }

    @Test public void distinguishesPcloudRegions(){
        assertEquals("pcloud-us",RemoteConfigStore.inferVendor("https://webdav.pcloud.com"));
        assertEquals("pcloud-eu",RemoteConfigStore.inferVendor("https://ewebdav.pcloud.com"));
    }
}
