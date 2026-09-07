package com.picalibrary.android;

import android.content.Context;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.view.Gravity;
import android.view.View;
import android.widget.LinearLayout;
import android.widget.TextView;

final class Ui {
    static final int BG = Color.rgb(246, 244, 250);
    static final int SURFACE = Color.WHITE;
    static final int PRIMARY = Color.rgb(103, 80, 164);
    static final int PRIMARY_SOFT = Color.rgb(234, 221, 255);
    static final int TEXT = Color.rgb(32, 30, 36);
    static final int MUTED = Color.rgb(104, 99, 110);
    static final int GOOD = Color.rgb(38, 116, 80);

    static int dp(Context c, int value) {
        return (int) (value * c.getResources().getDisplayMetrics().density + 0.5f);
    }

    static GradientDrawable rounded(int color, float radiusDp, Context c) {
        GradientDrawable d = new GradientDrawable();
        d.setColor(color);
        d.setCornerRadius(dp(c, (int) radiusDp));
        return d;
    }

    static TextView text(Context c, String s, float sp, int color, boolean bold) {
        TextView v = new TextView(c);
        v.setText(s);
        v.setTextSize(sp);
        v.setTextColor(color);
        v.setTypeface(Typeface.DEFAULT, bold ? Typeface.BOLD : Typeface.NORMAL);
        v.setLineSpacing(0, 1.08f);
        return v;
    }

    static LinearLayout card(Context c) {
        LinearLayout l = new LinearLayout(c);
        l.setOrientation(LinearLayout.VERTICAL);
        l.setPadding(dp(c, 18), dp(c, 16), dp(c, 18), dp(c, 16));
        l.setBackground(rounded(SURFACE, 20, c));
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(-1, -2);
        p.setMargins(dp(c, 16), dp(c, 7), dp(c, 16), dp(c, 7));
        l.setLayoutParams(p);
        return l;
    }

    static TextView pill(Context c, String label, int bg, int fg) {
        TextView v = text(c, label, 12, fg, true);
        v.setGravity(Gravity.CENTER);
        v.setPadding(dp(c, 10), dp(c, 6), dp(c, 10), dp(c, 6));
        v.setBackground(rounded(bg, 14, c));
        return v;
    }

    static void gap(LinearLayout parent, Context c, int dp) {
        View v = new View(c);
        v.setLayoutParams(new LinearLayout.LayoutParams(1, Ui.dp(c, dp)));
        parent.addView(v);
    }
}
