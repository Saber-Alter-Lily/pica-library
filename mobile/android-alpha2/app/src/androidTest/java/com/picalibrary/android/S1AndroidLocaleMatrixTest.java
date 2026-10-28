package com.picalibrary.android;

import static org.junit.Assert.*;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.os.SystemClock;
import android.util.Log;
import android.view.View;
import android.widget.TextView;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.io.File;
import java.io.FileOutputStream;

/** Disposable Android UI matrix; no login, source lookup, download, sync or update. */
@RunWith(AndroidJUnit4.class)
public final class S1AndroidLocaleMatrixTest {
    private static final String TAG="S1_MATRIX";
    private static final Class<? extends Activity>[] PAGES=new Class[]{
        AdvancedGuideActivity.class,AccountSourcesActivity.class,DownloadsActivity.class,
        RecommendationStyleActivity.class,RemoteStorageActivity.class,PairingActivity.class,
        TagParticipationActivity.class
    };
    private static final String[] NAMES={
        "guide","sources","downloads","recommendation","webdav","pairing","tags"
    };

    @Test public void sixRealPagesRenderAtRequestedLocaleThemeFontAndWidth() throws Exception {
        Instrumentation inst=InstrumentationRegistry.getInstrumentation();
        Context app=inst.getTargetContext().getApplicationContext();
        android.os.Bundle args=InstrumentationRegistry.getArguments();
        String locale=args.getString("language","zh-CN");
        String theme=args.getString("theme","light");
        String caseId=args.getString("caseId","");
        int width=Integer.parseInt(args.getString("widthDp","360"));
        float font=Float.parseFloat(args.getString("expectedFontScale","1.0"));
        assertTrue("Invalid screenshot identifier",caseId.matches("[a-zA-Z0-9-]{5,60}"));
        assertTrue("Invalid app locale",LocaleStore.ZH_CN.equals(locale)
            ||LocaleStore.EN.equals(locale)||LocaleStore.JA.equals(locale));
        assertTrue("Invalid app theme",ThemeStore.MODE_LIGHT.equals(theme)||ThemeStore.MODE_DARK.equals(theme));
        assertTrue("Unexpected device width",width==360||width==393||width==480);
        assertEquals("Font scaling not applied",font,app.getResources().getConfiguration().fontScale,0.07f);
        // This is a pixel-evidence gate, not merely an Activity/layout test.
        // Both AOSP-ATD black surfaces and empty white transitions must fail
        // even if the app still owns Android's focused accessibility window.
        Bitmap blank=Bitmap.createBitmap(720,1280,Bitmap.Config.ARGB_8888);
        try{
            for(int color:new int[]{android.graphics.Color.BLACK,android.graphics.Color.WHITE}){
                blank.eraseColor(color);
                assertFalse("Blank black/white screen accepted as light UI",
                    looksPainted(blank,ThemeStore.MODE_LIGHT));
                assertFalse("Blank black/white screen accepted as dark UI",
                    looksPainted(blank,ThemeStore.MODE_DARK));
            }
        }finally{blank.recycle();}

        app.getSharedPreferences("pica-disclaimer-v1",Context.MODE_PRIVATE)
            .edit().putString("accepted_version","1").commit();
        OnboardingStore.setAutoShow(app,false);
        LocaleStore.set(app,locale);
        app.getSharedPreferences("appearance-v1",Context.MODE_PRIVATE)
            .edit().putString("mode",theme).commit();
        File dir=new File(app.getFilesDir(),"s1-layout-"+caseId);
        assertTrue(dir.isDirectory()||dir.mkdirs());

        for(int i=0;i<PAGES.length;i++){
            Class<? extends Activity> type=PAGES[i];
            String page=NAMES[i];
            Instrumentation.ActivityMonitor monitor=inst.addMonitor(type.getName(),null,false);
            Activity opened=null;
            try{
                app.startActivity(new Intent(app,type).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
                Activity seen=monitor.waitForActivityWithTimeout(20000);
                assertNotNull("Page not launched: "+page,seen);
                assertTrue("Incorrect Activity: "+page,type.isInstance(seen));
                opened=seen;
                final Activity current=opened;
                SystemClock.sleep(450);
                inst.runOnMainSync(()->{
                    View decor=current.getWindow().getDecorView();
                    assertTrue(page+": no laid-out root",decor.getWidth()>0&&decor.getHeight()>0);
                    assertEquals(page+": wrong application locale",locale,LocaleStore.language(current));
                    assertEquals(page+": wrong persisted theme",theme,ThemeStore.mode(current));
                    int actual=current.getResources().getConfiguration().screenWidthDp;
                    assertTrue(page+": width="+actual+" expected="+width,Math.abs(actual-width)<=2);
                    View anchor=null;
                    if(current instanceof AdvancedGuideActivity)
                        anchor=decor.findViewWithTag("advanced-guide-open");
                    else if(current instanceof AccountSourcesActivity){
                        anchor=decor.findViewWithTag("account-sources-heading");
                        if(anchor instanceof TextView)assertEquals(current.getString(R.string.account_sources_title),
                            ((TextView)anchor).getText().toString());
                    }else if(current instanceof DownloadsActivity){
                        anchor=decor.findViewWithTag("phone-downloads-heading");
                        if(anchor instanceof TextView)assertEquals(current.getString(R.string.phone_downloads_title),
                            ((TextView)anchor).getText().toString());
                    }else if(current instanceof RecommendationStyleActivity)
                        anchor=decor.findViewWithTag(AndroidOnboarding.REC_VISUAL_MODE);
                    else if(current instanceof RemoteStorageActivity)
                        anchor=decor.findViewWithTag(AndroidOnboarding.ADV_REMOTE_VENDOR);
                    else if(current instanceof PairingActivity)
                        anchor=decor.findViewWithTag(AndroidOnboarding.ADV_PAIR_MANUAL);
                    else if(current instanceof TagParticipationActivity){
                        anchor=decor.findViewWithTag("tag-participation-heading");
                        View back=decor.findViewWithTag("tag-participation-back");
                        assertNotNull("Tag editor missing actual back control",back);
                        assertNotNull("Tag editor missing actual heading",anchor);
                        android.graphics.Rect left=new android.graphics.Rect(),right=new android.graphics.Rect();
                        assertTrue("Back control not in viewport",back.getGlobalVisibleRect(left));
                        assertTrue("Tag heading not in viewport",anchor.getGlobalVisibleRect(right));
                        assertTrue("Tag heading overlaps back",right.left>=left.right);
                    }
                    assertNotNull(page+": actual control is missing",anchor);
                    assertTrue(page+": actual control is not visible",anchor.isShown());
                });
                if(current instanceof TagParticipationActivity){
                    // A loading shell is not visual evidence for the tag editor.
                    boolean ready=false;
                    for(int poll=0;poll<40;poll++){
                        final boolean[] found={false};
                        inst.runOnMainSync(()->found[0]=current.getWindow().getDecorView()
                            .findViewWithTag("tag-all")!=null);
                        if(found[0]){ready=true;break;}
                        SystemClock.sleep(180);
                    }
                    assertTrue("Tags page did not finish loading actual controls",ready);
                }
                Bitmap image=readyScreenshot(inst,page,theme,caseId,dir,current);
                try{
                    assertTrue(page+": screenshot width "+image.getWidth(),
                        Math.abs(image.getWidth()-width*2)<=8);
                    File file=new File(dir,page+".png");
                    try(FileOutputStream out=new FileOutputStream(file)){
                        assertTrue("Cannot encode PNG",image.compress(Bitmap.CompressFormat.PNG,100,out));
                        out.getFD().sync();
                    }
                    assertTrue(page+": empty PNG",file.length()>1000);
                    Log.i(TAG,"case="+caseId+" page="+page+" bytes="+file.length());
                }finally{image.recycle();}
            }finally{
                inst.removeMonitor(monitor);
                if(opened!=null){
                    final Activity closing=opened;
                    inst.runOnMainSync(()->{if(!closing.isFinishing())closing.finish();});
                }
            }
        }
    }

    /** A launcher ANR dialog can make a blank or obscured frame pass a simple
     * luminance test. Require this Activity to own the active focused window,
     * in addition to painted content, before accepting any screenshot. */
    private Bitmap readyScreenshot(Instrumentation inst,String page,String theme,String caseId,File dir,Activity current){
        String ownPackage=inst.getTargetContext().getPackageName();
        String lastOwner="<none>";
        boolean lastFocused=false,lastPainted=false;
        for(int attempt=0;attempt<15;attempt++){
            SystemClock.sleep(attempt==0?200:220);
            final boolean[] focused={false};
            inst.runOnMainSync(()->focused[0]=current.getWindow().getDecorView().hasWindowFocus());
            android.view.accessibility.AccessibilityNodeInfo root=
                inst.getUiAutomation().getRootInActiveWindow();
            String windowOwner=root==null?"<none>":String.valueOf(root.getPackageName());
            if(root!=null)root.recycle();
            Bitmap image=inst.getUiAutomation().takeScreenshot();
            lastOwner=windowOwner;
            lastFocused=focused[0];
            if(image!=null){
                boolean painted=looksPainted(image,theme);
                lastPainted=painted;
                if(focused[0]&&ownPackage.equals(windowOwner)&&painted){
                    Log.i(TAG,"case="+caseId+" page="+page+" painted-attempt="+(attempt+1)
                        +" active-owner="+windowOwner+" app-focused=true");
                    return image;
                }
                if(attempt==14)saveRejectedScreenshot(image,dir,page);
                image.recycle();
            }
            if(attempt==0||attempt==4||attempt==9||attempt==14){
                Log.w(TAG,"case="+caseId+" page="+page+" rejected-attempt="+(attempt+1)
                    +" active-owner="+windowOwner+" expected="+ownPackage
                    +" app-focused="+focused[0]+" painted="+lastPainted);
            }
        }
        throw new AssertionError("No unobscured, app-owned painted UI frame for "+caseId+"/"+page+
            "; active-owner="+lastOwner+" app-focused="+lastFocused+" painted="+lastPainted+
            "; last rejected frame saved when available");
    }

    private void saveRejectedScreenshot(Bitmap image,File dir,String page){
        File file=new File(dir,"rejected-"+page+".png");
        try(FileOutputStream out=new FileOutputStream(file)){
            if(!image.compress(Bitmap.CompressFormat.PNG,100,out))
                throw new java.io.IOException("Cannot encode rejected screenshot");
            out.getFD().sync();
        }catch(Exception e){Log.e(TAG,"Cannot retain rejected frame for "+page,e);}
    }

    private boolean looksPainted(Bitmap image,String theme){
        int width=image.getWidth(),height=image.getHeight();
        if(width<320||height<500)return false;
        boolean dark=ThemeStore.MODE_DARK.equals(theme);
        int outer=image.getPixel(4,height/2);
        int outerLight=(android.graphics.Color.red(outer)+
            android.graphics.Color.green(outer)+android.graphics.Color.blue(outer))/3;
        // A flat black capture used to pass the *light* branch merely because
        // black pixels were counted as ink. Match the actual requested theme
        // and demand BOTH readable text/controls and a contrasting background.
        if(dark?outerLight>145:outerLight<145)return false;
        int darkSamples=0,lightSamples=0,edges=0;
        for(int y=80;y<Math.min(height-80,420);y+=4){
            int previousLight=-1;
            for(int x=20;x<width-20;x+=4){
                int pixel=image.getPixel(x,y);
                int light=(android.graphics.Color.red(pixel)+
                    android.graphics.Color.green(pixel)+android.graphics.Color.blue(pixel))/3;
                if(light<105)darkSamples++;
                if(light>165)lightSamples++;
                if(previousLight>=0&&Math.abs(previousLight-light)>55)edges++;
                previousLight=light;
            }
        }
        // A real guide/form has a background AND visible text/button edges.
        // A single-color display, wallpaper or undrawn transition cannot pass.
        return darkSamples>=80&&lightSamples>=80&&edges>=8;
    }
}
