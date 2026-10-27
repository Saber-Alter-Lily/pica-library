package com.picalibrary.android;

import static org.junit.Assert.*;

import android.app.Application;
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
        assertTrue(status.getLineCount()>1);
        assertTrue(status.getRight()<=arrow.getLeft());
        assertTrue(arrow.getRight()<=width-row.getPaddingRight());
        assertTrue(row.getMeasuredHeight()>=Ui.dp(app,56));
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
