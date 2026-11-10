package com.picalibrary.android;

import static org.junit.Assert.*;
import java.io.IOException;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

/** Original source-free Reader metadata parser, no network, SDK or second Reader. */
@RunWith(RobolectricTestRunner.class)
@Config(sdk=28,application=android.app.Application.class)
public class BoundSourceClientTest {
    private static String chapters(int count)throws Exception{
        JSONArray rows=new JSONArray();
        for(int i=0;i<count;i++)
            rows.put(new JSONObject().put("id","host-chapter:"+
                String.format(java.util.Locale.ROOT,"%064x",i+1))
                .put("title","Chapter "+i).put("order",i+1).put("count",1));
        return rows.toString();
    }
    @Test public void xkcdSizeManifestPassesThroughV2Only()throws Exception{
        String manifest=chapters(3321);
        List<ReaderContent.Chapter> rows=BoundSourceClient.parseChapterRows(manifest,5000);
        assertEquals(3321,rows.size());
        assertEquals(1,rows.get(0).order);
        assertEquals(3321,rows.get(rows.size()-1).order);
        assertThrows(IOException.class,()->BoundSourceClient.parseChapterRows(manifest,2000));
        assertThrows(IOException.class,()->BoundSourceClient.parseChapterRows(chapters(5001),5000));
    }
}
