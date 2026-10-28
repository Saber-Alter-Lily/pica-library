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
        RecommendationStyleActivity.class,RemoteStorageActivity.class,PairingActivity.class
    };
    private static final String[] NAMES={
        "guide","sources","downloads","recommendation","webdav","pairing"
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
                    assertNotNull(page+": actual control is missing",anchor);
                    assertTrue(page+": actual control is not visible",anchor.isShown());
                });
                Bitmap image=inst.getUiAutomation().takeScreenshot();
                assertNotNull(page+": no real display screenshot",image);
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
}
