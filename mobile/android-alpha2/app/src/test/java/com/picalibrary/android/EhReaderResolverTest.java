package com.picalibrary.android;

import org.junit.Test;
import java.util.Map;
import static org.junit.Assert.*;

public class EhReaderResolverTest {
    @Test public void parsesBrowserVerifiedPageLinksByPosition() throws Exception {
        String html="<a href=\"/s/27797df505/4189472-1\">one</a>"+
            "<a href=\"https://e-hentai.org/s/abcdef0123/4189472-2\">two</a>"+
            "<a href=\"//e-hentai.org/s/abcdef0124/4189472-3\">three</a>";
        Map<Integer,String> links=EhReaderResolver.parsePageLinks(html,"https://e-hentai.org",4189472L);
        assertEquals(3,links.size());
        assertEquals("https://e-hentai.org/s/27797df505/4189472-1",links.get(1));
        assertTrue(links.get(2).endsWith("/4189472-2"));
        assertTrue(links.get(3).endsWith("/4189472-3"));
    }

    @Test public void ignoresOtherGalleryIds() throws Exception {
        String html="<a href=\"/s/27797df505/4189472-1\">ok</a><a href=\"/s/abcdef0123/999-1\">bad</a>";
        Map<Integer,String> links=EhReaderResolver.parsePageLinks(html,"https://e-hentai.org",4189472L);
        assertEquals(1,links.size());assertTrue(links.containsKey(1));
    }

    @Test public void parsesCurrentEhViewerStyleImageWithoutId() {
        String html="<div><img src=\"https://example.org/001.jpg\" style=\"max-width:100%\"></div>";
        assertEquals("https://example.org/001.jpg",EhReaderResolver.parseImageUrl(html));
    }

    @Test public void keepsLegacyImgIdFallbacks() {
        assertEquals("https://example.org/a.webp",EhReaderResolver.parseImageUrl("<img id='img' class='x' src='https://example.org/a.webp'>"));
        assertEquals("https://example.org/b.png",EhReaderResolver.parseImageUrl("<img src='https://example.org/b.png' class='x' id='img'>"));
    }

    @Test public void logicalLocatorIsStableAndRecognized() {
        String locator=EhReaderResolver.locator("eh:4189472:cd62b1209f",32);
        assertEquals("ehpage:32:eh:4189472:cd62b1209f",locator);assertTrue(EhReaderResolver.handles(locator));
    }
}
