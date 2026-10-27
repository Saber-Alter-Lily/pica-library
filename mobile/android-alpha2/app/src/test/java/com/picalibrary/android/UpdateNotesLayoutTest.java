package com.picalibrary.android;

import static org.junit.Assert.*;

import android.app.Application;
import android.content.Intent;
import android.graphics.Rect;
import android.view.View;
import android.view.ViewGroup;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.android.controller.ActivityController;
import org.robolectric.annotation.Config;

/** S1-03: long release notes may scroll without hiding the explicit update control. */
@RunWith(RobolectricTestRunner.class)
@Config(sdk=35,qualifiers="w360dp-h640dp-mdpi")
public class UpdateNotesLayoutTest {
    @Test public void longReleaseNotesLeaveTheManualUpdateActionInViewport(){
        Application app=RuntimeEnvironment.getApplication();
        Intent intent=new Intent(app,UpdateActivity.class)
            .putExtra(AndroidOnboarding.EXTRA_ADVANCED_CHAPTER,7);
        try(ActivityController<UpdateActivity> controller=
                Robolectric.buildActivity(UpdateActivity.class,intent).create()){
            UpdateActivity activity=controller.get();
            ViewGroup content=activity.findViewById(android.R.id.content);
            ScrollView scroll=activity.findViewWithTag("update.release.notes.scroll");
            assertNotNull(scroll);
            TextView notes=(TextView)scroll.getChildAt(0);
            StringBuilder copy=new StringBuilder();
            for(int i=0;i<70;i++)copy.append("Release note paragraph ").append(i).append("\n");
            notes.setText(copy.toString());
            scroll.setVisibility(View.VISIBLE);
            LinearLayout.LayoutParams params=(LinearLayout.LayoutParams)scroll.getLayoutParams();
            assertEquals("release notes region should use remaining height",0,params.height);
            assertTrue(params.weight>0f);

            int width=Ui.dp(activity,360),height=Ui.dp(activity,640);
            content.measure(View.MeasureSpec.makeMeasureSpec(width,View.MeasureSpec.EXACTLY),
                    View.MeasureSpec.makeMeasureSpec(height,View.MeasureSpec.EXACTLY));
            content.layout(0,0,width,height);

            View check=activity.findViewWithTag(AndroidOnboarding.ADV_UPDATE_CHECK);
            assertNotNull(check);
            Rect rect=new Rect();check.getDrawingRect(rect);
            content.offsetDescendantRectToMyCoords(check,rect);
            assertTrue("manual check control must remain visible: "+rect,rect.top>=0);
            assertTrue("manual check control must not be pushed off-screen: "+rect,
                    rect.bottom<=height);
            assertTrue("release notes are visible in a bounded viewport",scroll.getHeight()>0);
            assertTrue(notes.getMeasuredHeight()>=scroll.getMeasuredHeight());
            assertTrue("preview remains read-only until explicit tap",check.isEnabled());
        }
    }
}
