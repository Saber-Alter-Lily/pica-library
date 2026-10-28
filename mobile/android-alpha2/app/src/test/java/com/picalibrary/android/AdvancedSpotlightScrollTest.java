package com.picalibrary.android;

import static org.junit.Assert.*;

import android.app.Activity;
import android.graphics.Rect;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.android.controller.ActivityController;
import org.robolectric.annotation.Config;

/** S1: the existing ScrollView, not an external tour framework, owns actual scrolling. */
@RunWith(RobolectricTestRunner.class)
@Config(sdk=35,qualifiers="w360dp-h640dp-mdpi")
public class AdvancedSpotlightScrollTest {
    @Test public void advancedTourCanRevealAnOffscreenControlWithoutClickingIt(){
        try(ActivityController<Activity> controller=Robolectric.buildActivity(Activity.class)
                .create().start().resume().visible()){
            Activity activity=controller.get();
            ScrollView scroll=new ScrollView(activity);
            LinearLayout column=new LinearLayout(activity);
            column.setOrientation(LinearLayout.VERTICAL);
            View filler=new View(activity);
            column.addView(filler,new LinearLayout.LayoutParams(-1,Ui.dp(activity,1000)));
            Button target=new Button(activity);
            target.setText("Connection settings");
            column.addView(target,new LinearLayout.LayoutParams(-1,Ui.dp(activity,52)));
            scroll.addView(column);
            activity.setContentView(scroll);

            ViewGroup content=activity.findViewById(android.R.id.content);
            int width=Ui.dp(activity,360),height=Ui.dp(activity,640);
            content.measure(View.MeasureSpec.makeMeasureSpec(width,View.MeasureSpec.EXACTLY),
                    View.MeasureSpec.makeMeasureSpec(height,View.MeasureSpec.EXACTLY));
            content.layout(0,0,width,height);
            assertEquals(0,scroll.getScrollY());
            assertTrue(target.isShown());
            assertTrue(target.getHeight()>0);
            assertTrue("target should start outside the viewport",target.getTop()>height);
            boolean moved=AndroidOnboarding.revealAdvancedTarget(target,null);
            assertTrue("ScrollView should accept a spotlight's scroll request",moved);
            assertTrue(scroll.getScrollY()>0);
            // The tour is read-only: the request never triggers a click listener.
        }
    }
}
