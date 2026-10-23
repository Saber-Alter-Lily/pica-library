package com.picalibrary.android;

import static org.junit.Assert.*;
import org.junit.Test;

public class ReaderSourceFactoryTest {
    @Test public void preservesExplicitAndLegacyDesktopSources() {
        assertEquals("desktop", ReaderSourceFactory.kind(null));
        assertEquals("desktop", ReaderSourceFactory.kind(""));
        for(String value:new String[]{"desktop","phone","remote","pica","eh","jm","local"}) assertEquals(value,ReaderSourceFactory.kind(value));
    }
    @Test public void unknownSourceCannotFallBackToDesktop() {
        assertThrows(IllegalArgumentException.class,()->ReaderSourceFactory.kind("missing"));
    }
}
