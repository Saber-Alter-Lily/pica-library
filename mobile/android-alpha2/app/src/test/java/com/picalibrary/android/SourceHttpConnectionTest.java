package com.picalibrary.android;

import com.picalibrary.android.sources.SourceAccessPolicy;
import java.io.*;
import java.net.*;
import java.util.*;
import org.junit.Test;
import static org.junit.Assert.*;

public class SourceHttpConnectionTest {
    private static class Transport extends HttpURLConnection {
        int requests,disconnects;
        Transport() throws Exception {super(new URL("https://fixture.invalid/body"));}
        public void disconnect(){disconnects++;}
        public boolean usingProxy(){return false;}
        public void connect(){requests++;}
        public int getResponseCode(){requests++;return 200;}
        public InputStream getInputStream(){requests++;return new ByteArrayInputStream(new byte[]{7,8,9});}
        public OutputStream getOutputStream(){requests++;return new ByteArrayOutputStream();}
    }
    private SourceAccessPolicy policy(){return new SourceAccessPolicy(new SourceAccessPolicy.Snapshot(0,Arrays.asList("pica","eh")));}
    @Test public void disabledConstructorCannotStartNetwork() throws Exception {
        SourceAccessPolicy p=policy();p.save(0,Arrays.asList("eh"),s->{});Transport t=new Transport();assertThrows(SourceAccessPolicy.Disabled.class,()->SourceHttpConnection.guard(t,p.bind("pica")));assertEquals(0,t.requests);assertEquals(1,t.disconnects);
    }
    @Test public void disableDisconnectsExistingReadAndWriteStreams() throws Exception {
        SourceAccessPolicy p=policy();Transport t=new Transport();HttpURLConnection c=SourceHttpConnection.guard(t,p.bind("pica"));InputStream in=c.getInputStream();OutputStream out=c.getOutputStream();assertEquals(7,in.read());p.save(0,Arrays.asList("eh"),s->{});
        assertEquals(1,t.disconnects);assertThrows(SourceAccessPolicy.Disabled.class,in::read);assertThrows(SourceAccessPolicy.Disabled.class,()->out.write(1));assertThrows(SourceAccessPolicy.Disabled.class,c::getResponseCode);c.disconnect();
    }
    @Test public void changingOtherProviderDoesNotInterruptConnection() throws Exception {
        SourceAccessPolicy p=policy();Transport t=new Transport();HttpURLConnection c=SourceHttpConnection.guard(t,p.bind("eh"));p.save(0,Arrays.asList("eh"),s->{});assertEquals(200,c.getResponseCode());assertEquals(0,t.disconnects);c.disconnect();
    }
    @Test public void staleConnectionCannotResumeAfterReenable() throws Exception {
        SourceAccessPolicy p=policy();Transport t=new Transport();HttpURLConnection c=SourceHttpConnection.guard(t,p.bind("pica"));p.save(0,Arrays.asList("eh"),s->{});p.save(1,Arrays.asList("pica","eh"),s->{});assertThrows(SourceAccessPolicy.Disabled.class,c::getInputStream);assertEquals(0,t.requests);c.disconnect();
    }
    @Test public void callerTimeoutsAndRequestConfigurationReachTheOriginalTransport() throws Exception {
        SourceAccessPolicy p=policy();Transport t=new Transport();HttpURLConnection c=SourceHttpConnection.guard(t,p.bind("pica"));c.setConnectTimeout(701);c.setReadTimeout(802);c.setRequestMethod("POST");c.setRequestProperty("X-Fixture","ok");c.setDoOutput(true);c.setUseCaches(false);c.setInstanceFollowRedirects(false);
        assertEquals(701,t.getConnectTimeout());assertEquals(802,t.getReadTimeout());assertEquals("POST",t.getRequestMethod());assertEquals("ok",t.getRequestProperty("X-Fixture"));assertTrue(t.getDoOutput());assertFalse(t.getUseCaches());assertFalse(t.getInstanceFollowRedirects());c.disconnect();p.save(0,Collections.emptyList(),s->{});assertEquals(1,t.disconnects);
    }
}
