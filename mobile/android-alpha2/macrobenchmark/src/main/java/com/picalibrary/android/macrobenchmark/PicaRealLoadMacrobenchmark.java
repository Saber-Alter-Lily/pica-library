package com.picalibrary.android.macrobenchmark;

import androidx.benchmark.macro.CompilationMode;
import androidx.benchmark.macro.FrameTimingMetric;
import androidx.benchmark.macro.junit4.MacrobenchmarkRule;
import androidx.test.filters.LargeTest;
import androidx.test.filters.SdkSuppress;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.uiautomator.By;
import androidx.test.uiautomator.UiDevice;
import androidx.test.uiautomator.UiObject2;
import androidx.test.uiautomator.Until;

import kotlin.Unit;

import org.junit.Assume;
import org.junit.Rule;
import org.junit.Test;

import java.io.IOException;
import java.util.Collections;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** P2-K3 physical-device real download/Reader loaded evidence. */
@LargeTest
@SdkSuppress(minSdkVersion = 31)
public final class PicaRealLoadMacrobenchmark {
    private static final String TARGET_PACKAGE="com.picalibrary.android";
    private static final String SETUP_ACTIVITY=TARGET_PACKAGE+".BenchmarkSetupActivity";
    private static final String READER_BRIDGE=TARGET_PACKAGE+".BenchmarkReaderLaunchActivity";
    private static final String RESOURCE_RECEIVER=TARGET_PACKAGE+"/.BenchmarkResourceSnapshotReceiver";

    @Rule public MacrobenchmarkRule benchmarkRule=new MacrobenchmarkRule();

    @Test public void realDownloadOverlapTopLevelFrameTiming(){
        Assume.assumeTrue("K3 download-loaded benchmark requires picaK3DownloadLoaded=true after starting a real user-selected download.",argTrue("picaK3DownloadLoaded"));
        benchmarkRule.measureRepeated(
            TARGET_PACKAGE,
            Collections.singletonList(new FrameTimingMetric()),
            new CompilationMode.Partial(),
            null,
            5,
            scope->{
                UiDevice device=scope.getDevice();
                setup(device);
                scope.pressHome();
                scope.startActivityAndWait();
                requireObject(device,"我的书库");
                waitForDownloadRunning(device);
                return Unit.INSTANCE;
            },
            scope->{
                UiDevice device=scope.getDevice();
                assertDownloadRunning(device,"before navigation");
                clickAndSettle(device,"推荐");
                clickAndSettle(device,"书库");
                clickAndSettle(device,"在线");
                clickAndSettle(device,"设置");
                clickAndSettle(device,"书库");
                assertDownloadRunning(device,"after navigation");
                return Unit.INSTANCE;
            }
        );
    }

    @Test public void realReaderUnderDownloadFrameTiming(){
        Assume.assumeTrue("K3 Reader benchmark requires picaK3ReaderLoaded=true and real comic/chapter instrumentation arguments.",argTrue("picaK3ReaderLoaded"));
        final String comicId=arg("picaK3ComicId");
        final String episodeId=arg("picaK3EpisodeId");
        final String source=arg("picaK3Source");
        final String title=arg("picaK3Title");
        Assume.assumeTrue("picaK3ComicId is required",comicId!=null&&!comicId.trim().isEmpty());
        Assume.assumeTrue("picaK3EpisodeId is required",episodeId!=null&&!episodeId.trim().isEmpty());

        benchmarkRule.measureRepeated(
            TARGET_PACKAGE,
            Collections.singletonList(new FrameTimingMetric()),
            new CompilationMode.Partial(),
            null,
            3,
            scope->{
                UiDevice device=scope.getDevice();
                setup(device);
                launchReader(device,comicId,episodeId,source,title);
                waitForReader(device);
                waitForDownloadRunning(device);
                return Unit.INSTANCE;
            },
            scope->{
                UiDevice device=scope.getDevice();
                assertDownloadRunning(device,"before Reader interaction");
                requireReaderSurface(device);
                int width=device.getDisplayWidth();
                int height=device.getDisplayHeight();
                for(int i=0;i<24;i++){
                    int x=width/2;
                    int fromY=i%2==0?(int)(height*0.78f):(int)(height*0.30f);
                    int toY=i%2==0?(int)(height*0.30f):(int)(height*0.78f);
                    if(!device.swipe(x,fromY,x,toY,18))
                        throw new AssertionError("Reader swipe failed at step "+i);
                    device.waitForIdle(120L);
                }
                assertDownloadRunning(device,"after Reader interaction");
                return Unit.INSTANCE;
            }
        );
    }

    private static boolean argTrue(String key){return "true".equalsIgnoreCase(arg(key));}
    private static String arg(String key){return InstrumentationRegistry.getArguments().getString(key,"");}

    private static void setup(UiDevice device){shell(device,"am start -W -n "+TARGET_PACKAGE+"/"+SETUP_ACTIVITY,"benchmark setup");}

    private static void launchReader(UiDevice device,String comicId,String episodeId,String source,String title){
        String command="am start -W -n "+TARGET_PACKAGE+"/"+READER_BRIDGE+
            " --es comicId "+quote(comicId)+
            " --es episodeId "+quote(episodeId)+
            " --es source "+quote(source==null||source.isEmpty()?"pica":source)+
            " --es title "+quote(title==null||title.isEmpty()?"K3 Reader":title);
        shell(device,command,"Reader bridge");
    }

    private static String quote(String value){
        return "'"+value.replace("'","'\\''")+"'";
    }

    private static void waitForReader(UiDevice device){
        boolean found=device.wait(Until.hasObject(By.textContains("页")),15_000L);
        if(!found) throw new AssertionError("Reader did not become usable for K3 real chapter.");
    }

    private static UiObject2 requireReaderSurface(UiDevice device){
        UiObject2 object=device.findObject(By.textContains("页"));
        if(object==null||object.getParent()==null) throw new AssertionError("Missing Reader surface");
        UiObject2 parent=object.getParent();
        while(parent.getParent()!=null&&parent.getVisibleBounds().height()<device.getDisplayHeight()/2) parent=parent.getParent();
        return parent;
    }

    private static void waitForDownloadRunning(UiDevice device){
        String last="";
        long deadline=System.nanoTime()+20_000_000_000L;
        while(System.nanoTime()<deadline){
            last=resourceSnapshot(device);
            if(running(last,"media-network")>0&&running(last,"filesystem-heavy")>0)return;
            try{Thread.sleep(250L);}catch(InterruptedException e){Thread.currentThread().interrupt();throw new AssertionError(e);}
        }
        throw new AssertionError("Real download never became RUNNING for media-network + filesystem-heavy. Start a sufficiently large real user-selected download first. Last snapshot: "+last);
    }

    private static void assertDownloadRunning(UiDevice device,String phase){
        String snapshot=resourceSnapshot(device);
        if(running(snapshot,"media-network")<=0||running(snapshot,"filesystem-heavy")<=0)
            throw new AssertionError("Real download not RUNNING "+phase+": "+snapshot);
    }

    private static String resourceSnapshot(UiDevice device){return shell(device,"am broadcast -W -n "+RESOURCE_RECEIVER,"resource snapshot");}

    private static int running(String shellOutput,String resource){
        Matcher matcher=Pattern.compile(Pattern.quote(resource)+"=(\\d+)/(\\d+)").matcher(shellOutput==null?"":shellOutput);
        if(!matcher.find())throw new AssertionError("Missing resource "+resource+" in snapshot: "+shellOutput);
        return Integer.parseInt(matcher.group(1));
    }

    private static String shell(UiDevice device,String command,String label){
        try{
            String output=device.executeShellCommand(command);
            if(output==null||output.contains("Error:")||output.contains("Exception"))throw new AssertionError(label+" failed: "+output);
            return output;
        }catch(IOException e){throw new AssertionError(label+" shell command failed",e);}
    }

    private static UiObject2 requireObject(UiDevice device,String text){
        if(!device.wait(Until.hasObject(By.text(text)),10_000L))throw new AssertionError("Missing UI text: "+text);
        UiObject2 object=device.findObject(By.text(text));
        if(object==null)throw new AssertionError("Missing UI object: "+text);
        return object;
    }

    private static void clickAndSettle(UiDevice device,String text){
        requireObject(device,text).click();
        device.waitForIdle();
    }
}
