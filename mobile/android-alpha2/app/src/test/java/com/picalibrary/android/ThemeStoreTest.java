package com.picalibrary.android;
import static org.junit.Assert.*;
import org.junit.Test;
public class ThemeStoreTest {
    @Test public void baseModesRemainStable(){assertArrayEquals(new String[]{"system","light","dark"},ThemeStore.MODES);}
    @Test public void invalidModeFallsBackToSystem(){assertEquals(ThemeStore.MODE_SYSTEM,ThemeStore.normalizeMode("other"));assertEquals(ThemeStore.MODE_DARK,ThemeStore.normalizeMode("dark"));}
}
