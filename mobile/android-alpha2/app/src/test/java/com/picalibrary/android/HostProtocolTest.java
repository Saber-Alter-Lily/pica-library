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
    @Test public void pinnedUnknownCountIsMetadataOnlyAndPreservedInBothCatalogueShapes()throws Exception {
        HostTestFixture fixture=new HostTestFixture(RuntimeEnvironment.getApplication());fixture.unknownPageCount=true;
        assertEquals(-1,new HostProtocol.Chapter(fixture.chapter()).pageCount);
        assertEquals(7,HostProtocol.manga(fixture.response("PicaHostManga"),false).id);
        assertEquals(7,HostProtocol.manga(fixture.response("PicaHostPrepareManga"),true).id);
        assertEquals(-1,HostProtocol.chapterPage(fixture.response("PicaHostPagedChapters"),7,500,0).rows.get(0).pageCount);
        for(Object count:new Object[]{-2,-1.1,0.1,"-1",JSONObject.NULL,10001})assertThrows(Exception.class,()->new HostProtocol.Chapter(fixture.chapter().put("pageCount",count)));
    }
    @Test public void pageFetchMustResolveUnknownCountAndRetainsOwnershipChecks()throws Exception {
        HostTestFixture fixture=new HostTestFixture(RuntimeEnvironment.getApplication());fixture.unknownPageCount=true;HostProtocol.Chapter expected=new HostProtocol.Chapter(fixture.chapter());
        JSONObject response=fixture.response("PicaHostChapterPages");assertEquals(2,HostProtocol.pages(response,expected).pageCount);
        for(int count:new int[]{-1,0})for(boolean empty:new boolean[]{false,true}){JSONObject invalid=fixture.response("PicaHostChapterPages"),body=invalid.getJSONObject("data").getJSONObject("fetchChapterPages");body.getJSONObject("chapter").put("pageCount",count);if(empty)body.put("pages",new JSONArray());assertThrows(IllegalArgumentException.class,()->HostProtocol.pages(invalid,expected));}
        fixture.wrongPage=true;assertThrows(IllegalArgumentException.class,()->HostProtocol.pages(fixture.response("PicaHostChapterPages"),expected));
    }
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
        HostTestFixture fixture=new HostTestFixture(RuntimeEnvironment.getApplication());JSONObject response=fixture.response("PicaHostPagedChapters");JSONArray rows=response.getJSONObject("data").getJSONObject("chapters").getJSONArray("nodes");rows.put(fixture.chapter());assertThrows(IllegalArgumentException.class,()->HostProtocol.chapterPage(response,7,500,0));
        assertThrows(IllegalArgumentException.class,()->new HostProtocol.Chapter(fixture.chapter().put("mangaId",0)));
        assertThrows(IllegalArgumentException.class,()->new HostProtocol.Chapter(fixture.chapter().put("pageCount",10001)));
    }
    @Test public void pagedLongMangaRejectsCrossSourceAndChangesWithoutUnboundedPayload()throws Exception {
        HostTestFixture f=new HostTestFixture(RuntimeEnvironment.getApplication());
        f.syntheticChapterCount=1001;
        JSONObject first=f.response("PicaHostPagedChapters",new JSONObject().put("id",7).put("first",500).put("offset",0));
        assertEquals(500,HostProtocol.chapterPage(first,7,500,0).rows.size());
        JSONObject last=f.response("PicaHostPagedChapters",new JSONObject().put("id",7).put("first",500).put("offset",1000));
        assertEquals(1,HostProtocol.chapterPage(last,7,500,1000).rows.size());
        assertThrows(IllegalArgumentException.class,()->HostProtocol.chapterPage(first,8,500,0));
        JSONObject over=f.response("PicaHostPagedChapters");
        over.getJSONObject("data").getJSONObject("chapters").put("totalCount",5001);
        assertEquals("SOURCE_HOST_TOO_LARGE",assertThrows(IllegalArgumentException.class,
            ()->HostProtocol.chapterPage(over,7,500,0)).getMessage());
        JSONObject bad=f.response("PicaHostPagedChapters");
        bad.getJSONObject("data").getJSONObject("chapters").getJSONArray("nodes")
            .getJSONObject(0).put("mangaId",8);
        assertThrows(IllegalArgumentException.class,()->HostProtocol.chapterPage(bad,7,500,0));
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
