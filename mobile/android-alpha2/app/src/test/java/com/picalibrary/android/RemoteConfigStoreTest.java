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
}
