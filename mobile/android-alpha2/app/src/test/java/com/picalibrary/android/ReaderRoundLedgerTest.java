package com.picalibrary.android;

import android.content.Context;
import android.app.Activity;
import android.widget.FrameLayout;
import java.util.*;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.Robolectric;
import org.robolectric.android.controller.ActivityController;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;

/** App-private SQLite and atomic snapshot integration. All titles/IDs are synthetic. */
@RunWith(RobolectricTestRunner.class)
@Config(sdk=32)
public class ReaderRoundLedgerTest {
    public static class ReceiptActivity extends Activity{
        boolean focused;
        @Override public boolean hasWindowFocus(){return focused;}
    }
    // Trigger the real listener list synchronously in Robolectric; the framework dispatch helper can be hidden in SDK stubs.
    private static void draw(FrameLayout v)throws Exception{
        android.view.ViewTreeObserver.class.getDeclaredMethod("dispatchOnDraw").invoke(v.getViewTreeObserver());
    }
    @Test public void backgroundAndReplacedPagesDoNotCountButTheForegroundPageDoes() throws Exception{
        ActivityController<ReceiptActivity> ctl=Robolectric.buildActivity(ReceiptActivity.class).setup().visible();
        ReceiptActivity a=ctl.get();FrameLayout container=new FrameLayout(a);a.setContentView(container);
        NativeRecommendationStore.Snapshot snapshot=new NativeRecommendationStore.Snapshot();
        snapshot.cycleId="test-draw";snapshot.readerOrdinal=1;
        snapshot.batches.add(Collections.singletonList(new NativeRecommendationStore.Item("draw-book","synthetic","test","","","",0)));
        NativeRecommendationStore.save(a,snapshot);ReaderRoundLedger db=ReaderRoundLedger.get(a);
        try{
            a.focused=true;RecommendationPageReceipt.afterDraw(a,container,snapshot,()->false);
            draw(container);RecommendationPageReceipt.flush();assertFalse(db.shown().contains("draw-book"));
            a.focused=false;RecommendationPageReceipt.afterDraw(a,container,snapshot,()->true);
            draw(container);RecommendationPageReceipt.flush();assertFalse(db.shown().contains("draw-book"));
            a.focused=true;draw(container);RecommendationPageReceipt.flush();assertTrue(db.shown().contains("draw-book"));
        }finally{ctl.pause().stop().destroy();}
    }
    @Test public void preparingLoadingAndPagingAreNotImpressionsButActualReceiptsPersist(){
        Context c=RuntimeEnvironment.getApplication();ReaderRoundLedger db=ReaderRoundLedger.get(c);
        NativeRecommendationStore.Snapshot s=new NativeRecommendationStore.Snapshot();s.readerOrdinal=4;s.cycleId="synthetic-round";
        NativeRecommendationStore.Item first=NativeRecommendationStore.withWork("test-w",new NativeRecommendationStore.Item("test-a","first","Test Author","", "", "",1));
        NativeRecommendationStore.Item second=new NativeRecommendationStore.Item("test-b","second","Other author","", "", "",1);
        s.batches.add(Collections.singletonList(first));s.batches.add(Collections.singletonList(second));s.creatorQueries.put("test author",4);
        NativeRecommendationStore.save(c,s);NativeRecommendationStore.Snapshot reopened=NativeRecommendationStore.load(c);
        assertEquals("test-w",reopened.current().get(0).confirmedWorkId);assertEquals(Integer.valueOf(4),reopened.creatorQueries.get("test author"));
        NativeRecommendationStore.nextBatch(c);NativeRecommendationStore.previousBatch(c);assertFalse(db.shown().contains("test-a"));assertFalse(db.shown().contains("test-b"));
        NativeRecommendationStore.acknowledgePage(c,reopened,reopened.current());db.close();
        assertTrue(db.shown().contains("test-a"));assertTrue(db.shownWorks().contains("work:test-w"));assertFalse(db.shown().contains("test-b"));
        db.presented(1,Collections.singletonList(first));assertEquals(Integer.valueOf(4),db.clocks().get("test author"));
    }
    @Test public void oldSerialRemainsUnreadUntilItsUpdatedChapterIsOpened(){
        Context context=RuntimeEnvironment.getApplication();ReaderRoundLedger db=ReaderRoundLedger.get(context);
        String author="synthetic serial author";db.follow(author);long t=db.subscriptionSince(author);
        ReaderRoundLedger.Observation old=new ReaderRoundLedger.Observation("serial","serial",7,t-1);
        db.observe(author,"test",Collections.singletonList(old),true,t);assertTrue(db.inbox().isEmpty());
        db.observe(author,"test",Arrays.asList(new ReaderRoundLedger.Observation("serial","alt title",9,t-1),
            new ReaderRoundLedger.Observation("new","new",2,t+1)),true,t+2);db.close();
        assertEquals(3,db.inbox().size());assertEquals(3,db.inbox().size()); // opening the list is not reading
        db.openedChapter("serial",7);assertEquals(3,db.inbox().size());
        db.openedChapter("serial",8);assertEquals(2,db.inbox().size());
        db.openedChapter("new",1);assertEquals(1,db.inbox().size());assertEquals(9,db.inbox().get(0).chapter);
        db.dismiss(db.inbox().get(0));db.observe(author,"test",Collections.singletonList(new ReaderRoundLedger.Observation("serial","renamed",9,t-1)),true,t+3);
        assertTrue(db.inbox().isEmpty());db.unfollow(author);assertFalse(db.following().containsKey(author));
        db.observe(author,"test",Collections.singletonList(old),true,t+4);assertTrue(db.inbox().isEmpty());
    }
}
