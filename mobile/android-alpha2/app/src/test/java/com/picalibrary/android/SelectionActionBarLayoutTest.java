package com.picalibrary.android;

import static org.junit.Assert.*;

import android.app.Application;
import android.content.Context;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.LinearLayout;
import java.util.ArrayList;
import java.util.List;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.android.controller.ActivityController;
import org.robolectric.annotation.Config;
import org.robolectric.annotation.LooperMode;

/** S1 selection actions: structural dimensions, not physical-device screenshot acceptance. */
@RunWith(RobolectricTestRunner.class)
@Config(sdk=35)
@LooperMode(LooperMode.Mode.PAUSED)
public class SelectionActionBarLayoutTest {
    private void verify(int expectedRows,int widthDp){
        Application app=RuntimeEnvironment.getApplication();
        LocaleStore.set(app,LocaleStore.JA);
        OnboardingStore.setAutoShow(app,false);
        app.getSharedPreferences("pica-disclaimer-v1",Context.MODE_PRIVATE)
                .edit().putString("accepted_version","1").commit();

        try(ActivityController<HomeActivity> c=Robolectric.buildActivity(HomeActivity.class)
                .create().start().resume().visible()){
            HomeActivity activity=c.get();
            activity.onCollectionSelectionStateChanged(true,3,false);
            ViewGroup content=activity.findViewById(android.R.id.content);
            int w=Ui.dp(activity,widthDp),h=Ui.dp(activity,900);
            content.measure(View.MeasureSpec.makeMeasureSpec(w,View.MeasureSpec.EXACTLY),
                    View.MeasureSpec.makeMeasureSpec(h,View.MeasureSpec.EXACTLY));
            content.layout(0,0,w,h);

            LinearLayout root=(LinearLayout)content.getChildAt(0);
            LinearLayout host=(LinearLayout)root.getChildAt(1);
            LinearLayout actionBar=(LinearLayout)host.getChildAt(0);
            int rows=0;
            List<Button> buttons=new ArrayList<>();
            for(int i=0;i<actionBar.getChildCount();i++){
                View child=actionBar.getChildAt(i);
                if(!(child instanceof LinearLayout))continue;
                rows++;
                LinearLayout row=(LinearLayout)child;
                for(int k=0;k<row.getChildCount();k++){
                    Button b=(Button)row.getChildAt(k);
                    buttons.add(b);
                    assertTrue("selection action width should be useable",b.getMeasuredWidth()>=Ui.dp(activity,72));
                    assertEquals("actions must allow two localized lines",2,b.getMaxLines());
                }
            }
            assertEquals(expectedRows,rows);
            assertEquals("no action may be hidden behind overflow",5,buttons.size());
            assertEquals("only two actions may occupy the narrow bottom row",
                    expectedRows==2?2:5,
                    ((LinearLayout)actionBar.getChildAt(actionBar.getChildCount()-1)).getChildCount());
        }
    }

    @Test @Config(qualifiers="w360dp-h900dp-mdpi")
    public void narrowPhoneSplitsFiveActionsIntoTwoRows(){verify(2,360);}

    @Test @Config(qualifiers="w600dp-h900dp-mdpi")
    public void wideScreenKeepsCompactActionsInOneRow(){verify(1,600);}
}
