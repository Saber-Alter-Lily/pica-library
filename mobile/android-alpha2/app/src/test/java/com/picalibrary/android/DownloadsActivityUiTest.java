package com.picalibrary.android;

import static org.junit.Assert.*;

import android.app.Application;
import android.content.Context;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.TextView;
import org.junit.After;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.android.controller.ActivityController;
import org.robolectric.annotation.Config;

/** Header and translation layout contract; not a physical-device screenshot. */
@RunWith(RobolectricTestRunner.class)
@Config(sdk=35, application=Application.class)
public final class DownloadsActivityUiTest {
    @After public void restoreLocale(){
        LocaleStore.set(RuntimeEnvironment.getApplication(), LocaleStore.ZH_CN);
    }

    @Test @Config(qualifiers="w360dp-h900dp-mdpi")
    public void narrowEnglishTitleAndTasksStaySeparated(){check(LocaleStore.EN,360,"Phone downloads");}

    @Test @Config(qualifiers="w393dp-h900dp-mdpi")
    public void chineseLayoutStillUsesShortControls(){check(LocaleStore.ZH_CN,393,"手机下载");}

    @Test @Config(qualifiers="w480dp-h900dp-mdpi")
    public void japaneseTitleDoesNotDisplaceTasks(){check(LocaleStore.JA,480,"端末内ダウンロード");}

    private void check(String language,int width,String expected){
        Context app=RuntimeEnvironment.getApplication();
        LocaleStore.set(app,language);
        try(ActivityController<DownloadsActivity> controller=
                Robolectric.buildActivity(DownloadsActivity.class).create()){
            DownloadsActivity activity=controller.get();
            ViewGroup decor=(ViewGroup)activity.getWindow().getDecorView();
            TextView heading=(TextView)decor.findViewWithTag("phone-downloads-heading");
            Button task=(Button)decor.findViewWithTag(AndroidOnboarding.ADV_DOWNLOAD_TASKS);
            assertNotNull(heading);assertNotNull(task);
            assertEquals(expected,heading.getText().toString());
            assertEquals(activity.getString(R.string.phone_downloads_tasks_short),task.getText().toString());
            assertEquals(2,heading.getMaxLines());
            assertFalse(activity.getString(R.string.phone_downloads_storage_settings).isEmpty());
            assertFalse(activity.getString(R.string.phone_downloads_note,"1.0 MB").isEmpty());

            ViewGroup root=activity.findViewById(android.R.id.content);
            root.measure(View.MeasureSpec.makeMeasureSpec(width,View.MeasureSpec.EXACTLY),
                View.MeasureSpec.makeMeasureSpec(900,View.MeasureSpec.EXACTLY));
            root.layout(0,0,width,900);
            assertTrue("title needs visible width",heading.getWidth()>0);
            assertTrue("task control needs visible width",task.getWidth()>0);
            // Both controls have the same immediate horizontal parent.
            assertSame(heading.getParent(),task.getParent());
            assertTrue("title/task overlap",heading.getRight()<=task.getLeft()+1);
            assertTrue("task clips beyond screen",task.getRight()<=width);
        }
    }
}
