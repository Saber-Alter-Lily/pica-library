package com.picalibrary.android;

import static org.junit.Assert.*;

import android.app.Application;
import android.content.Context;
import android.content.res.Configuration;
import android.view.View;
import android.widget.LinearLayout;
import android.widget.TextView;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;

/** S1-03: real Android widget measurement, not proof of a physical-device visual pass. */
@RunWith(RobolectricTestRunner.class)
@Config(sdk={28,35},application=Application.class)
public class SettingsRowNarrowLayoutTest {
    @Test public void longLocalizedStatusDoesNotStealEntireTitleWidth(){
        Application app=RuntimeEnvironment.getApplication();
        Ui.applyTheme(app);
        LinearLayout row=SettingsRow.row(app,
                "用于推荐的标签与私人标签",
                "长状态说明：尚未配置、与 Desktop 同步后才可以继续查看详情",
                v->{});
        int width=Ui.dp(app,320);
        row.measure(View.MeasureSpec.makeMeasureSpec(width,View.MeasureSpec.EXACTLY),
                View.MeasureSpec.makeMeasureSpec(Ui.dp(app,500),View.MeasureSpec.AT_MOST));
        row.layout(0,0,width,row.getMeasuredHeight());

        TextView title=(TextView)row.getChildAt(0);
        TextView status=(TextView)row.getChildAt(1);
        TextView arrow=(TextView)row.getChildAt(2);
        assertEquals(0,((LinearLayout.LayoutParams)title.getLayoutParams()).width);
        assertEquals(0,((LinearLayout.LayoutParams)status.getLayoutParams()).width);
        assertTrue(title.getMeasuredWidth()>Ui.dp(app,85));
        assertTrue(status.getMeasuredWidth()>Ui.dp(app,60));
        // Robolectric sometimes reports zero/one line until a draw pass despite correct measured bounds.
        // Keep the structural multi-line contract; actual text wrapping is covered by device screenshots.
        assertTrue(status.getMaxLines()>1);
        assertNull(status.getEllipsize());
        assertTrue(status.getRight()<=arrow.getLeft());
        assertTrue(arrow.getRight()<=width-row.getPaddingRight());
        assertTrue(row.getMeasuredHeight()>=Ui.dp(app,56));
    }

    @Test public void largeFontNarrowSourceRowStacksInsteadOfOrphaningCjkTitle(){
        Application app=RuntimeEnvironment.getApplication();
        Configuration config=new Configuration(app.getResources().getConfiguration());
        config.screenWidthDp=360;
        config.fontScale=1.5f;
        Context enlarged=app.createConfigurationContext(config);
        Ui.applyTheme(enlarged);
        LinearLayout row=SettingsRow.row(enlarged,
            "本机外部漫画源","独立选择 Pica / E-H / JM，不改变电脑设置",v->{});
        assertEquals("Stacked label group and arrow only",2,row.getChildCount());
        assertTrue(row.getChildAt(0) instanceof LinearLayout);
        LinearLayout labels=(LinearLayout)row.getChildAt(0);
        assertEquals(LinearLayout.VERTICAL,labels.getOrientation());
        assertEquals(2,labels.getChildCount());
        TextView title=(TextView)labels.getChildAt(0);
        TextView status=(TextView)labels.getChildAt(1);
        TextView arrow=(TextView)row.getChildAt(1);
        int width=Ui.dp(enlarged,320);
        row.measure(View.MeasureSpec.makeMeasureSpec(width,View.MeasureSpec.EXACTLY),
            View.MeasureSpec.makeMeasureSpec(Ui.dp(enlarged,600),View.MeasureSpec.AT_MOST));
        row.layout(0,0,width,row.getMeasuredHeight());
        assertTrue("Title gets full label width",title.getMeasuredWidth()>Ui.dp(enlarged,215));
        assertEquals("Status aligned below title, not squeezed into right column",
            android.view.Gravity.START|android.view.Gravity.CENTER_VERTICAL,status.getGravity());
        assertEquals(title.getMeasuredWidth(),status.getMeasuredWidth());
        assertTrue("Arrow must stay within row",arrow.getRight()<=width-row.getPaddingRight());
    }

    @Test public void largeFontWideRowKeepsOriginalHorizontalLayout(){
        Application app=RuntimeEnvironment.getApplication();
        Configuration config=new Configuration(app.getResources().getConfiguration());
        config.screenWidthDp=600;
        config.fontScale=1.5f;
        Context enlarged=app.createConfigurationContext(config);
        LinearLayout row=SettingsRow.row(enlarged,"来源","已同步",v->{});
        assertEquals("600dp is not a narrow layout",3,row.getChildCount());
        assertTrue(row.getChildAt(0) instanceof TextView);
        assertTrue(row.getChildAt(1) instanceof TextView);
    }

    @Test public void largeFontProfileStatusLineUsesFullWidthForLongEngineIdentifier(){
        Application app=RuntimeEnvironment.getApplication();
        Configuration config=new Configuration(app.getResources().getConfiguration());
        config.screenWidthDp=360;config.fontScale=1.5f;
        Context enlarged=app.createConfigurationContext(config);
        LinearLayout line=SettingsRow.statusLine(enlarged,"Engine",
            "native-v3.1-frozen-neutral-compatible");
        assertEquals(LinearLayout.VERTICAL,line.getOrientation());
        assertEquals(2,line.getChildCount());
        int width=Ui.dp(enlarged,290);
        line.measure(View.MeasureSpec.makeMeasureSpec(width,View.MeasureSpec.EXACTLY),
            View.MeasureSpec.makeMeasureSpec(Ui.dp(enlarged,600),View.MeasureSpec.AT_MOST));
        line.layout(0,0,width,line.getMeasuredHeight());
        TextView title=(TextView)line.getChildAt(0);
        TextView value=(TextView)line.getChildAt(1);
        assertEquals(width,title.getMeasuredWidth());
        assertEquals(width,value.getMeasuredWidth());
        assertEquals("Technical status should read left-to-right from a full-width line",
            android.view.Gravity.START|android.view.Gravity.CENTER_VERTICAL,value.getGravity());
    }

    @Test public void statusLineAlsoBoundsBothColumns(){
        Application app=RuntimeEnvironment.getApplication();
        Ui.applyTheme(app);
        LinearLayout line=SettingsRow.statusLine(app,"来源",
                "正在从其他客户端读取完整且较长的同步状态说明");
        int width=Ui.dp(app,260);
        line.measure(View.MeasureSpec.makeMeasureSpec(width,View.MeasureSpec.EXACTLY),
                View.MeasureSpec.makeMeasureSpec(Ui.dp(app,400),View.MeasureSpec.AT_MOST));
        line.layout(0,0,width,line.getMeasuredHeight());
        assertTrue(line.getChildAt(0).getMeasuredWidth()>0);
        assertTrue(line.getChildAt(1).getMeasuredWidth()>0);
        assertTrue(line.getChildAt(1).getRight()<=width);
    }
}
