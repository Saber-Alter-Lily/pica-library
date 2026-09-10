package com.picalibrary.android;

import org.junit.Test;
import java.util.*;
import static org.junit.Assert.*;

public class SourcePolicyTest {
    @Test public void remoteAndPicaWorkWithoutDesktop(){assertTrue(SourcePolicy.canReadWithoutDesktop(true,false));assertTrue(SourcePolicy.canReadWithoutDesktop(false,true));assertFalse(SourcePolicy.canReadWithoutDesktop(false,false));}
    @Test public void readerOrderKeepsPersistentDownloadAndCacheAheadOfNetwork(){List<SourcePolicy.Kind> order=SourcePolicy.readerOrder(true,true,true,true);assertEquals(Arrays.asList(SourcePolicy.Kind.PHONE_DOWNLOAD,SourcePolicy.Kind.PHONE_CACHE,SourcePolicy.Kind.DESKTOP_LAN,SourcePolicy.Kind.REMOTE_STORAGE,SourcePolicy.Kind.PICA_ONLINE),order);}
    @Test public void legacyOrderWithoutPhoneDownloadIsStable(){List<SourcePolicy.Kind> order=SourcePolicy.readerOrder(true,true,true);assertEquals(Arrays.asList(SourcePolicy.Kind.PHONE_CACHE,SourcePolicy.Kind.DESKTOP_LAN,SourcePolicy.Kind.REMOTE_STORAGE,SourcePolicy.Kind.PICA_ONLINE),order);}
}
