package com.picalibrary.android;

import static org.junit.Assert.assertEquals;

import java.net.HttpURLConnection;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Locale;
import org.junit.Test;

public class RemoteLibraryClient123PanTest {
    private static String flatName(String logical) throws Exception {
        byte[] raw=MessageDigest.getInstance("SHA-256").digest(logical.getBytes(StandardCharsets.UTF_8));
        StringBuilder hex=new StringBuilder();
        for(byte b:raw)hex.append(String.format(Locale.ROOT,"%02x",b&255));
        return "pica-library-"+hex+".bin";
    }

    @Test public void maps123PanLogicalObjectsToFlatFiles() throws Exception {
        RemoteConfigStore.Config config=RemoteConfigStore.candidate(
                "https://webdav.123pan.cn",
                "PicaLibrary",
                "user",
                "app-password",
                null
        );
        RemoteLibraryClient client=new RemoteLibraryClient(config);
        HttpURLConnection connection=client.open("v1/control/current.json","application/json");
        assertEquals(
                "https://webdav.123pan.cn/webdav/"+flatName("PicaLibrary/v1/control/current.json"),
                connection.getURL().toString()
        );
        connection.disconnect();
    }

    @Test public void keepsOrdinaryWebDavHierarchy() throws Exception {
        RemoteConfigStore.Config config=RemoteConfigStore.candidate(
                "https://dav.example",
                "PicaLibrary",
                "user",
                "password",
                null
        );
        RemoteLibraryClient client=new RemoteLibraryClient(config);
        HttpURLConnection connection=client.open("v1/control/current.json","application/json");
        assertEquals(
                "https://dav.example/PicaLibrary/v1/control/current.json",
                connection.getURL().toString()
        );
        connection.disconnect();
    }
}
