package com.picalibrary.android;

import org.junit.Test;
import java.util.List;
import static org.junit.Assert.*;

public class EhPageParsingTest {
    @Test public void parsesRelativeAbsoluteAndProtocolRelativeImagePages() throws Exception {
        String html="<a href=\"/s/aaa111/123-1\">one</a>"+
                "<a href='https://e-hentai.org/s/bbb222/123-2'>two</a>"+
                "<a href=\"//e-hentai.org/s/ccc333/123-3\">three</a>";
        List<String> pages=EhClient.parsePageLinks(html,"https://e-hentai.org",123);
        assertEquals(3,pages.size());
        assertEquals("https://e-hentai.org/s/aaa111/123-1",pages.get(0));
        assertEquals("https://e-hentai.org/s/bbb222/123-2",pages.get(1));
        assertEquals("https://e-hentai.org/s/ccc333/123-3",pages.get(2));
    }

    @Test public void ignoresOtherGalleryIdsAndDeduplicatesByPagePath() throws Exception {
        String html="/s/aaa111/123-1 /s/aaa111/123-1 https://e-hentai.org/s/zzz999/999-1";
        List<String> pages=EhClient.parsePageLinks(html,"https://e-hentai.org",123);
        assertEquals(1,pages.size());
        assertTrue(pages.get(0).endsWith("/s/aaa111/123-1"));
    }

    @Test public void acceptsExhentaiSurfaceLinks() throws Exception {
        String html="<a href='//exhentai.org/s/abc999/456-7'>p7</a>";
        List<String> pages=EhClient.parsePageLinks(html,"https://exhentai.org",456);
        assertEquals(1,pages.size());
        assertEquals("https://exhentai.org/s/abc999/456-7",pages.get(0));
    }
}
