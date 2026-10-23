package com.picalibrary.android;

import android.app.Application;
import android.content.Context;
import android.graphics.Bitmap;
import android.os.Looper;
import com.picalibrary.android.sources.SourceAccessPolicy;
import java.io.*;
import java.net.*;
import java.nio.file.Files;
import java.util.*;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.*;
import org.junit.runner.RunWith;
import org.robolectric.*;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;

/** Real encoded-image cache, fake transport; never contacts an external provider. */
@RunWith(RobolectricTestRunner.class)
@Config(sdk=35,application=Application.class)
public class ReaderImagesSourceAccessTest {
    private Context app;
    private SourceAccessPolicy policy;
    private SourceAccessPolicy.Permit permit;
    private ReaderImages reader;
    private final AtomicInteger networkCalls=new AtomicInteger();
    private byte[] image;
    private final String scope="source-lifecycle-fixture";
    @Before public void setUp() throws Exception {
        app=RuntimeEnvironment.getApplication();
        policy=new SourceAccessPolicy(new SourceAccessPolicy.Snapshot(0,Collections.singleton("jm")));
        permit=policy.bind("jm");
        Bitmap bitmap=Bitmap.createBitmap(2,2,Bitmap.Config.ARGB_8888);
        try(ByteArrayOutputStream out=new ByteArrayOutputStream()){
            assertTrue(bitmap.compress(Bitmap.CompressFormat.PNG,100,out));image=out.toByteArray();
        }finally{bitmap.recycle();}
    }
    @After public void close(){if(reader!=null)reader.close();}
    private File cached(String path){return new File(MobileStoragePaths.cacheDir(app,"reader-pages-v2/"+scope),ReaderPolicy.hash(path));}
    private void disable() throws Exception {policy.save(policy.snapshot().revision,Collections.emptyList(),value->{});}
    private ReaderSource source(Runnable afterResponse){return new ReaderSource(){
        public SourceAccessPolicy.Permit sourceAccess(){return permit;}
        public String kind(){return "jm";}
        public String scope(){return scope;}
        public List<BridgeClient.ChapterItem> chapters(String id){throw new AssertionError("No chapter request expected");}
        public BridgeClient.ChapterData chapter(String id,String episode){throw new AssertionError("No chapter request expected");}
        public String recentChapter(String id){return "";}
        public void saveProgress(String id,String episode,int page){}
        public HttpURLConnection image(String path) throws Exception {
            networkCalls.incrementAndGet();permit.check();
            return new HttpURLConnection(new URL("https://fixture.invalid/page")){
                public void connect(){}
                public boolean usingProxy(){return false;}
                public int getResponseCode(){return 200;}
                public InputStream getInputStream(){return new ByteArrayInputStream(image);}
                public void disconnect(){afterResponse.run();}
            };
        }
    };}
    private void load(String path,boolean expectedSuccess) throws Exception {
        AtomicBoolean complete=new AtomicBoolean(),succeeded=new AtomicBoolean();
        reader.load(path,100,new ReaderImages.Callback(){
            public void complete(Bitmap bitmap){succeeded.set(true);bitmap.recycle();complete.set(true);}
            public void failed(){complete.set(true);}
        });
        long deadline=System.nanoTime()+java.util.concurrent.TimeUnit.SECONDS.toNanos(5);
        while(!complete.get()&&System.nanoTime()<deadline){Shadows.shadowOf(Looper.getMainLooper()).idle();Thread.sleep(10);}
        assertTrue("Reader callback must complete",complete.get());
        assertEquals(expectedSuccess,succeeded.get());
    }
    @Test public void cachedPageRemainsReadableAfterSourceDisabledWithoutNetwork() throws Exception {
        String path="https://fixture.invalid/cached";Files.write(cached(path).toPath(),image);disable();
        reader=new ReaderImages(app,source(()->{}));load(path,true);
        assertEquals(0,networkCalls.get());assertArrayEquals(image,Files.readAllBytes(cached(path).toPath()));
    }
    @Test public void downloadedFileRemainsReadableWithoutSourceOrReaderCacheCopy() throws Exception {
        File file=new File(app.getFilesDir(),"local-page.png");Files.write(file.toPath(),image);disable();
        reader=new ReaderImages(app,source(()->{}));load(android.net.Uri.fromFile(file).toString(),true);
        assertEquals(0,networkCalls.get());assertArrayEquals(image,Files.readAllBytes(file.toPath()));assertEquals(0,ReaderImages.cacheBytes(app));
    }
    @Test public void completedOldResponseCannotPublishCacheAfterDisableAndReenable() throws Exception {
        String path="https://fixture.invalid/late";
        reader=new ReaderImages(app,source(()->{try{disable();policy.save(policy.snapshot().revision,Collections.singleton("jm"),value->{});}catch(Exception e){throw new AssertionError(e);}}));
        load(path,false);assertEquals(1,networkCalls.get());assertFalse(cached(path).exists());
        assertEquals(app.getString(R.string.source_disabled),reader.failureDetail(path));
        assertEquals(0,Objects.requireNonNull(cached(path).getParentFile().list()).length);
    }
}
