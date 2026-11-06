package com.picalibrary.android;

import static org.junit.Assert.*;
import org.junit.Test;

public class HostEndpointTest {
    @Test public void normalizesOnlyExplicitUserEndpointAndKeepsBasePath() {
        HostEndpoint endpoint=new HostEndpoint("https://EXAMPLE.invalid/base",false,"basic");
        assertEquals("https://example.invalid/base/",endpoint.value);
        assertEquals("https://example.invalid/base/api/graphql",endpoint.request("api/graphql").toString());
        assertTrue(endpoint.encrypted);assertFalse(endpoint.loopback);
    }
    @Test public void insecureLanIsAnExplicitSeparateDecision() {
        assertThrows(IllegalArgumentException.class,()->new HostEndpoint("http://192.168.1.3",false,"none"));
        assertEquals("http://192.168.1.3/",new HostEndpoint("http://192.168.1.3",true,"none").value);
        assertThrows(IllegalArgumentException.class,()->new HostEndpoint("http://192.168.1.3",true,"basic"));
        assertThrows(IllegalArgumentException.class,()->new HostEndpoint("http://public.invalid",true,"none"));
    }
    @Test public void loopbackAllowsOwnBasicSessionButNoAmbientCredentials() {
        assertTrue(new HostEndpoint("http://127.0.0.1:4567",false,"basic").loopback);
        assertTrue(new HostEndpoint("http://[::1]:4567",false,"basic").loopback);
        assertThrows(IllegalArgumentException.class,()->new HostEndpoint("https://u:p@fixture.invalid",false,"basic"));
    }
    @Test public void rejectsAmbiguousOrUnsafeAddressesWithoutResolvingThem() {
        for(String value:new String[]{""," https://example.invalid","https://example.invalid?q=a","https://example.invalid/#x","https://example.invalid/%2fprivate","https://example.invalid/../private","https://example.invalid:0","https://169.254.169.254","https://0.0.0.0","https://224.0.0.1","http://2130706433","http://127.00.0.1","file:///tmp/private","https://[::ffff:127.0.0.1]","https://[fe80::1]","https://fixture.invalid/a\\b"})
            assertThrows(value,IllegalArgumentException.class,()->new HostEndpoint(value,true,"none"));
    }
    @Test public void onlyPinnedGraphqlAndOwnedRasterRoutesCanBeRequested() {
        HostEndpoint endpoint=new HostEndpoint("https://fixture.invalid/",false,"none");
        assertTrue(endpoint.request("api/v1/manga/7/chapter/0/page/0").toString().endsWith("/page/0"));
        for(String route:new String[]{"https://else.invalid/","../private","api/v1/settings","api/graphql?query=private","api/v1/manga/7/chapter/0/page/10000","api/v1/manga/0/chapter/0/page/1"})assertThrows(IllegalArgumentException.class,()->endpoint.request(route));
    }
}
