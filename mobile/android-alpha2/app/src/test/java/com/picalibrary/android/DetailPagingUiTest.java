package com.picalibrary.android;

import android.app.*;
import android.content.Intent;
import android.view.*;
import android.widget.*;
import java.lang.reflect.*;
import java.util.*;
import org.junit.*;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import static org.robolectric.Shadows.shadowOf;
import static org.junit.Assert.*;

/** Real Android views in a blank sandbox. Drive the same completion callbacks as the provider,
 * without calling any provider, starting the app's background workers, or opening a real book. */
@RunWith(RobolectricTestRunner.class)
@Config(sdk={32,35},application=Application.class,qualifiers="zh-rCN")
public class DetailPagingUiTest {
    static Object call(Object o,String method,Object... args) throws Exception {
        for(Method m:o.getClass().getDeclaredMethods())if(m.getName().equals(method)&&m.getParameterCount()==args.length){
            m.setAccessible(true);return m.invoke(o,args);
        }
        throw new NoSuchMethodException(method);
    }
    static Field field(Object o,String k)throws Exception{Field f=o.getClass().getDeclaredField(k);f.setAccessible(true);return f;}
    static Object get(Object o,String k)throws Exception{return field(o,k).get(o);}
    static void put(Object o,String k,Object v)throws Exception{field(o,k).set(o,v);}
    static void layout(View v,int w,int h){
        v.measure(View.MeasureSpec.makeMeasureSpec(w,View.MeasureSpec.EXACTLY),View.MeasureSpec.makeMeasureSpec(h,View.MeasureSpec.EXACTLY));
        v.layout(0,0,w,h);v.getViewTreeObserver().dispatchOnPreDraw();
    }
    static ReadingHistoryStore.Session bookmark(String ch,int pos){
        ReadingHistoryStore.Session b=new ReadingHistoryStore.Session("fixture");
        b.comicId="fixture";b.chapterId=ch;b.sourceKind="phone";b.lastPage=pos;return b;
    }
    static UnifiedComicDetailActivity detail(ReadingHistoryStore.Session bookmark,int n)throws Exception{
        UnifiedComicDetailActivity a=Robolectric.buildActivity(UnifiedComicDetailActivity.class).get();
        Ui.applyWindow(a);
        UnifiedCatalogStore.Entry e=new UnifiedCatalogStore.Entry("fixture","QA lighthouse","");e.knownPictures=178;
        put(a,"entry",e);put(a,"bookmark",bookmark);call(a,"render");
        List<BridgeClient.ChapterItem> chapters=new ArrayList<>();
        for(int i=1;i<=n;i++)chapters.add(new BridgeClient.ChapterItem("c"+i,""+i,i,178));
        Class<?> type=Class.forName(UnifiedComicDetailActivity.class.getName()+"$ProbeResult");
        Constructor<?> make=type.getDeclaredConstructors()[0];make.setAccessible(true);
        call(a,"accept",make.newInstance("phone","手机",0,chapters,false,false));call(a,"finishProbing");return a;
    }
    @Test public void libraryHasNoOverlayAtAnyDensityButInboxKeepsMenu(){
        // The adapter needs only the attached themed context, not a whole Activity launch.
        Activity a=Robolectric.buildActivity(Activity.class).get();
        for(int mode:new int[]{0,2,3,5}){
            UnifiedComicCollectionAdapter adapter=new UnifiedComicCollectionAdapter(a,mode,Collections.emptyList(),null);
            assertNull(adapter.onCreateViewHolder(new LinearLayout(a),mode).play);
            adapter.setCardOverlay((h,book)->{});assertNotNull(adapter.onCreateViewHolder(new LinearLayout(a),mode).play);
        }
    }
    @Test public void singleChapterUnreadOpensFirstAndHasNoNumberTile()throws Exception{
        UnifiedComicDetailActivity a=detail(null,1);Button read=(Button)get(a,"primaryRead");
        assertTrue(read.isEnabled());assertEquals("开始阅读",read.getText().toString());
        assertEquals(1,((LinearLayout)get(a,"chapterArea")).getChildCount());
        assertEquals(View.GONE,((View)get(a,"sourceDetails")).getVisibility());read.performClick();
        assertEquals("c1",shadowOf(a).getNextStartedActivity().getStringExtra("episodeId"));
    }
    @Test public void singleChapterResumeDisplaysOneBasedPageAndLaunchesZeroBased()throws Exception{
        UnifiedComicDetailActivity a=detail(bookmark("c1",33),1);Button read=(Button)get(a,"primaryRead");
        assertTrue(read.getText().toString().contains("34/178"));read.performClick();
        Intent launch=shadowOf(a).getNextStartedActivity();assertEquals("phone",launch.getStringExtra("source"));
        assertEquals("c1",launch.getStringExtra("episodeId"));
        assertEquals(33,launch.getIntExtra("detailStartPage",-1));
        assertTrue(launch.getBooleanExtra("detailExactChapter",false));
    }
    @Test public void longDirectoryStartsOnRememberedRange()throws Exception{
        UnifiedComicDetailActivity a=detail(bookmark("c87",11),120);
        assertEquals(4,get(a,"rangeIndex"));String label=((Button)get(a,"primaryRead")).getText().toString();
        assertTrue(label.contains("87"));assertTrue(label.contains("12"));((Button)get(a,"primaryRead")).performClick();
        assertEquals("c87",shadowOf(a).getNextStartedActivity().getStringExtra("episodeId"));
    }
    @Test public void missingChapterNeverFallsBackToWrongBookPosition()throws Exception{
        UnifiedComicDetailActivity a=detail(bookmark("gone",31),1);((Button)get(a,"primaryRead")).performClick();
        assertNull(shadowOf(a).getNextStartedActivity());
        assertTrue(((LinearLayout)get(a,"chapterArea")).getChildCount()>1);
        assertEquals(View.VISIBLE,((View)get(a,"sourceState")).getVisibility());
    }
    @Test public void chapterRemovedBetweenDetailAndReaderNeverOpensAnother(){
        List<BridgeClient.ChapterItem> available=Collections.singletonList(new BridgeClient.ChapterItem("other","Other",1,50));
        assertNull(ReaderActivity.initialChapterId(available,"now-missing",true));
        assertEquals("other",ReaderActivity.initialChapterId(available,"other",true));
        assertEquals("other",ReaderActivity.initialChapterId(available,null,false));
    }
    static Object state(PicaBrowseActivity a,String name)throws Exception{
        List<String> ids=new ArrayList<>();for(int i=0;i<18;i++)ids.add(name+i);
        Object state=call(a,"prepareRenderState",ids,name,3);
        UnifiedCatalogStore.Snapshot catalog=(UnifiedCatalogStore.Snapshot)get(state,"catalog");
        for(String id:ids)catalog.byId.put(id,new UnifiedCatalogStore.Entry(id,"Book "+id,"QA"));
        return state;
    }
    static PicaBrowseActivity browse()throws Exception{
        PicaBrowseActivity a=Robolectric.buildActivity(PicaBrowseActivity.class).get();
        Ui.applyWindow(a);call(a,"render");call(a,"showIds",state(a,"First"),false);
        return a;
    }
    static ScrollView atBottom(PicaBrowseActivity a)throws Exception{
        ScrollView sc=(ScrollView)get(a,"viewport");layout(sc,380,480);sc.fullScroll(View.FOCUS_DOWN);
        sc.scrollTo(0,Integer.MAX_VALUE);assertTrue(sc.getScrollY()>900);return sc;
    }
    @Test public void nextPageCommitsAtTopAndDoubleTapDoesNotSkip()throws Exception{
        PicaBrowseActivity a=browse();ScrollView sc=atBottom(a);int bottom=sc.getScrollY();int[] requests={0};
        a.turnPage(1,()->requests[0]++);a.turnPage(1,()->requests[0]++);assertEquals(1,requests[0]);
        int token=(int)call(a,"busy");assertEquals(bottom,sc.getScrollY());call(a,"finishPage",token,state(a,"Second"));
        layout(sc,380,480);assertEquals(0,sc.getScrollY());assertEquals(2,get(a,"shownPage"));
        sc.scrollTo(0,1700);a.turnPage(-1,()->{});int older=(int)call(a,"busy");
        call(a,"finishPage",older,state(a,"First"));layout(sc,380,480);assertEquals(0,sc.getScrollY());
    }
    @Test public void failureKeepsScrollAndRetriesSamePage()throws Exception{
        PicaBrowseActivity a=browse();ScrollView sc=atBottom(a);int bottom=sc.getScrollY();a.turnPage(1,()->{});int token=(int)call(a,"busy");
        call(a,"fail",token,"QA",new Exception("offline"));assertEquals(bottom,sc.getScrollY());
        assertEquals(1,get(a,"page"));a.turnPage(1,()->{});assertEquals(2,get(a,"page"));
    }
    @Test public void samePageRefreshOpenDetailsAndObsoleteCompletionDoNotJump()throws Exception{
        PicaBrowseActivity a=browse();ScrollView sc=atBottom(a);sc.scrollTo(0,1700);
        call(a,"showIds",state(a,"Translation"),false);layout(sc,380,480);assertEquals(1700,sc.getScrollY());
        ((LinearLayout)get(a,"results")).getChildAt(8).performClick();
        assertEquals("Translation8",shadowOf(a).getNextStartedActivity().getStringExtra("comicId"));
        Instrumentation lifecycle=new Instrumentation();lifecycle.callActivityOnPause(a);lifecycle.callActivityOnResume(a);
        layout(sc,380,480);assertEquals(1700,sc.getScrollY());
        int obsolete=(int)call(a,"busy");call(a,"busy");call(a,"finishPage",obsolete,state(a,"Stale"));
        assertEquals("Translation",get(a,"lastLabel"));assertEquals(1700,sc.getScrollY());
    }
}
