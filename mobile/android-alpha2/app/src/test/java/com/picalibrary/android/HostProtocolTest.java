package com.picalibrary.android;

import static org.junit.Assert.*;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import org.json.*;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.*;
import org.robolectric.annotation.Config;

@RunWith(RobolectricTestRunner.class)
@Config(sdk=28,application=android.app.Application.class)
public class HostProtocolTest {
    @Test public void sourceIdsNeverRoundTripThroughDouble() {
        assertEquals(Long.toString(Long.MIN_VALUE),HostProtocol.sourceId(Long.toString(Long.MIN_VALUE)));
        assertEquals(Long.toString(Long.MAX_VALUE),HostProtocol.sourceId(Long.toString(Long.MAX_VALUE)));
        for(Object value:new Object[]{123,1.0,"01","-0","9223372036854775808","-9223372036854775809","1e3"})assertThrows(IllegalArgumentException.class,()->HostProtocol.sourceId(value));
    }
    @Test public void refusesPartialGraphqlDataAndUnsupportedServer()throws Exception {
        HostTestFixture fixture=new HostTestFixture(RuntimeEnvironment.getApplication());JSONObject response=fixture.response("PicaSourceHostInfo");HostProtocol.server(response);
        response.put("errors",new JSONArray().put(new JSONObject().put("message","partial")));assertThrows(IllegalArgumentException.class,()->HostProtocol.server(response));
        JSONObject unsupported=fixture.response("PicaSourceHostInfo");unsupported.getJSONObject("data").getJSONObject("aboutServer").put("version","2.5.0");assertThrows(IllegalArgumentException.class,()->HostProtocol.server(unsupported));
    }
    @Test public void candidateSourceAndPageOwnershipAreChecked()throws Exception {
        HostTestFixture fixture=new HostTestFixture(RuntimeEnvironment.getApplication());HostProtocol.Search result=HostProtocol.search(fixture.response("PicaHostSourceSearch"),HostTestFixture.SOURCE);assertEquals(1,result.rows.size());
        assertThrows(IllegalArgumentException.class,()->HostProtocol.search(fixture.response("PicaHostSourceSearch"),"1"));
        HostProtocol.Chapter chapter=new HostProtocol.Chapter(fixture.chapter());assertEquals(2,HostProtocol.pages(fixture.response("PicaHostChapterPages"),chapter).pageCount);
        fixture.wrongPage=true;assertThrows(IllegalArgumentException.class,()->HostProtocol.pages(fixture.response("PicaHostChapterPages"),chapter));
    }
    @Test public void malformedChapterIdentityAndDuplicateRowsFailClosed()throws Exception {
        HostTestFixture fixture=new HostTestFixture(RuntimeEnvironment.getApplication());JSONObject response=fixture.response("PicaHostManga");JSONArray rows=response.getJSONObject("data").getJSONObject("manga").getJSONObject("chapters").getJSONArray("nodes");rows.put(fixture.chapter());assertThrows(IllegalArgumentException.class,()->HostProtocol.bundle(response,false));
        assertThrows(IllegalArgumentException.class,()->new HostProtocol.Chapter(fixture.chapter().put("mangaId",0)));
        assertThrows(IllegalArgumentException.class,()->new HostProtocol.Chapter(fixture.chapter().put("pageCount",10001)));
    }
    @Test public void strictJsonRejectsTrailingDuplicatePermissiveAndDeepPayloads()throws Exception {
        assertEquals(1,HostJson.object("{\"n\":1}".getBytes(StandardCharsets.UTF_8)).getInt("n"));
        for(String value:new String[]{"{\"n\":1} trailing","{\"n\":1}{\"n\":2}","{\"n\":1,\"n\":2}","{n:1}","{'n':1}","{\"n\":NaN}","{\"n\":"+"[".repeat(34)+"0"+"]".repeat(34)+"}"})assertThrows(IOException.class,()->HostJson.object(value.getBytes(StandardCharsets.UTF_8)));
        assertThrows(IOException.class,()->HostJson.object(new byte[]{(byte)0xff}));
    }
    @Test public void malformedUnicodeCannotAliasIdentityDigestsThroughUtf8Replacement() {
        assertEquals("Valid \ud83d\ude00",HostProtocol.text("Valid \ud83d\ude00",100));
        assertThrows(IllegalArgumentException.class,()->HostProtocol.text("/url/\ud800",100));assertThrows(IllegalArgumentException.class,()->HostProtocol.text("/url/\udc00",100));
    }
}
