package com.picalibrary.android;

import static org.junit.Assert.*;
import org.junit.Test;

public class ReaderSourceFactoryTest {
    @Test public void preservesExplicitAndLegacyDesktopSources() {
        assertEquals("desktop", ReaderSourceFactory.kind(null));
        assertEquals("desktop", ReaderSourceFactory.kind(""));
        for(String value:new String[]{"desktop","phone","remote","pica","eh","jm","local","host"}) assertEquals(value,ReaderSourceFactory.kind(value));
    }
    @Test public void existingBridgeValuesAreAlsoSourceNeutralReaderValues() {
        BridgeClient.ChapterItem chapter=new BridgeClient.ChapterItem("chapter-1","First",1,2);
        BridgeClient.PageItem page=new BridgeClient.PageItem("page-1","file:///owned/1.png",1);
        ReaderContent.Chapter chapterValue=chapter;
        ReaderContent.Page pageValue=page;
        ReaderContent.ChapterData data=new BridgeClient.ChapterData(
                chapter,java.util.Collections.singletonList(page),0);
        assertEquals("chapter-1",chapterValue.id);
        assertEquals(2,chapterValue.downloadedPictures);
        assertEquals("file:///owned/1.png",pageValue.url);
        assertEquals("page-1",data.pages.get(0).id);
        assertEquals(chapterValue,data.episode);
    }

    @Test public void unknownSourceCannotFallBackToDesktop() {
        assertThrows(IllegalArgumentException.class,()->ReaderSourceFactory.kind("missing"));
    }
}
