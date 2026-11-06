package com.picalibrary.android;

import static org.junit.Assert.*;
import android.content.Context;
import java.io.*;
import java.net.*;
import org.junit.*;
import org.junit.runner.RunWith;
import org.robolectric.*;
import org.robolectric.annotation.Config;

@RunWith(RobolectricTestRunner.class)
@Config(sdk=28,application=android.app.Application.class)
public class HostHttpTest {
    private Context context;private HostTestFixture fixture;
    @Before public void setup()throws Exception {context=RuntimeEnvironment.getApplication();fixture=new HostTestFixture(context);}
    @After public void end(){fixture.manager.end();}
    @Test public void fixedRequestsDisableRedirectsCachesAndNeverInheritProviderAuth()throws Exception {
        fixture.configured();fixture.manager.start("","",true);HostTestFixture.Connection connection=fixture.opened.get(0);
        assertEquals("POST",connection.getRequestMethod());assertFalse(connection.getInstanceFollowRedirects());assertFalse(connection.getUseCaches());assertEquals(4000,connection.getConnectTimeout());assertEquals(12000,connection.getReadTimeout());assertNull(connection.getRequestProperty("Authorization"));assertNull(connection.getRequestProperty("Cookie"));assertTrue(connection.disconnects>0);
        assertEquals("PicaSourceHostInfo",connection.request.getString("operationName"));assertEquals(0,connection.request.getJSONObject("variables").length());
    }
    @Test public void redirectsNeverStartASecondRequest()throws Exception {
        fixture.configured();fixture.status=302;Exception error=assertThrows(Exception.class,()->fixture.manager.start("","",true));assertEquals("SOURCE_HOST_REDIRECT",error.getMessage());assertEquals(1,fixture.opened.size());assertTrue(fixture.opened.get(0).disconnects>0);assertFalse(fixture.manager.hasSession());
    }
    @Test public void authAndTransportErrorsUseOnlySanitizedCodes()throws Exception {
        fixture.configured();fixture.status=401;assertEquals("SOURCE_HOST_AUTH_REQUIRED",assertThrows(Exception.class,()->fixture.manager.start("","",true)).getMessage());fixture.status=200;fixture.errorOperation="PicaSourceHostInfo";Exception error=assertThrows(Exception.class,()->fixture.manager.start("","",true));assertEquals("SOURCE_HOST_UNAVAILABLE",error.getMessage());assertNull(error.getCause());
    }
    @Test public void imageTypeAndRasterBodyMustAgreeBeforeAnyBytesAreExposed()throws Exception {
        HostSourceManager.Book book=fixture.selected();HostReaderSource source=new HostReaderSource(fixture.manager);BridgeClient.ChapterData chapter=source.chapter(book.id,source.chapters(book.id).get(0).id);fixture.imageType="image/jpeg";
        HttpURLConnection image=source.image(chapter.pages.get(0).url);try{assertThrows(IOException.class,image::getInputStream);}finally{image.disconnect();}fixture.imageType="text/html";image=source.image(chapter.pages.get(0).url);try{assertThrows(IOException.class,image::getResponseCode);}finally{image.disconnect();}
    }
    @Test public void boundedResponseReaderRejectsActualBytesNotJustDeclaredLength()throws Exception {
        assertEquals(10,HostHttp.read(new ByteArrayInputStream(new byte[10]),10).length);assertThrows(IOException.class,()->HostHttp.read(new ByteArrayInputStream(new byte[11]),10));
    }
    @Test public void ambientCookieHandlerIsRejectedWithoutGlobalMutation()throws Exception {
        CookieHandler old=CookieHandler.getDefault();CookieManager ambient=new CookieManager();try{CookieHandler.setDefault(ambient);fixture.configured();Exception error=assertThrows(Exception.class,()->fixture.manager.start("","",true));assertEquals("SOURCE_HOST_UNSUPPORTED",error.getMessage());assertSame(ambient,CookieHandler.getDefault());assertEquals(0,fixture.opened.size());}finally{CookieHandler.setDefault(old);}
    }
}
