package com.picalibrary.android;

import static org.junit.Assert.*;
import org.junit.Test;

public final class PicaLeaderboardRangeTest {
    @Test public void acceptsAllProviderLeaderboardRanges(){
        assertEquals("H24",PicaClient.normalizeLeaderboardRange("H24"));
        assertEquals("D7",PicaClient.normalizeLeaderboardRange("D7"));
        assertEquals("D30",PicaClient.normalizeLeaderboardRange("D30"));
    }
    @Test public void fallsBackTo24HoursForUnknownValues(){
        assertEquals("H24",PicaClient.normalizeLeaderboardRange(null));
        assertEquals("H24",PicaClient.normalizeLeaderboardRange(""));
        assertEquals("H24",PicaClient.normalizeLeaderboardRange("bad"));
    }
}
