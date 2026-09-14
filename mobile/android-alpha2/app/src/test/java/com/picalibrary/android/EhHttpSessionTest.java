package com.picalibrary.android;

import org.junit.Test;
import java.util.LinkedHashMap;
import static org.junit.Assert.*;

public class EhHttpSessionTest {
    @Test public void parsesAndRejoinsCookieHeaderWithoutValuesLeakingElsewhere() {
        LinkedHashMap<String,String> values=EhHttpSession.parseCookies("ipb_member_id=123; ipb_pass_hash=abc; nw=1");
        assertEquals("123",values.get("ipb_member_id"));
        assertEquals("abc",values.get("ipb_pass_hash"));
        assertEquals("1",values.get("nw"));
        String joined=EhHttpSession.joinCookies(values);
        assertTrue(joined.contains("ipb_member_id=123"));
        assertTrue(joined.contains("ipb_pass_hash=abc"));
    }

    @Test public void ignoresMalformedCookieFragments() {
        LinkedHashMap<String,String> values=EhHttpSession.parseCookies("good=value; broken; =bad; empty=; also=ok");
        assertEquals(2,values.size());
        assertEquals("value",values.get("good"));
        assertEquals("ok",values.get("also"));
    }

    @Test public void recognizesOnlyEhFamilyHosts() {
        assertTrue(EhHttpSession.isEhFamily("e-hentai.org"));
        assertTrue(EhHttpSession.isEhFamily("forums.e-hentai.org"));
        assertTrue(EhHttpSession.isEhFamily("exhentai.org"));
        assertFalse(EhHttpSession.isEhFamily("example.org"));
    }
}
