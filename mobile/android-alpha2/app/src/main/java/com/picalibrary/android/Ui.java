package com.picalibrary.android;

import android.app.Activity;
import android.content.Context;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.ColorDrawable;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.GradientDrawable;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.ImageButton;
import android.widget.LinearLayout;
import android.widget.TextView;

/** Process palette + compact widget primitives. ThemeStore owns persistence; this class owns rendering tokens. */
final class Ui {
    static int BG,SURFACE,NAV,PRIMARY,PRIMARY_SOFT,TEXT,MUTED,GOOD,GOOD_SOFT,WARN,WARN_SOFT,BAD,BAD_SOFT,ACTION,OUTLINE,PLACEHOLDER,FAVORITE;
    private static boolean dark;

    static { applyPalette(false); }
    private Ui(){}

    static void applyTheme(Context c){dark=ThemeStore.isDark(c);applyPalette(dark);ThemePackStore.applyToUi(c,dark);}
    static boolean dark(){return dark;}
    static void applyWindow(Activity a){applyTheme(a);Drawable themeBackground=ThemePackStore.backgroundDrawable(a);a.getWindow().getDecorView().setBackground(themeBackground!=null?themeBackground:new ColorDrawable(opaque(BG)));a.getWindow().setStatusBarColor(opaque(BG));a.getWindow().setNavigationBarColor(opaque(BG));int flags=View.SYSTEM_UI_FLAG_LAYOUT_STABLE;if(!dark)flags|=View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR|View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;a.getWindow().getDecorView().setSystemUiVisibility(flags);}
    private static int opaque(int color){return Color.rgb(Color.red(color),Color.green(color),Color.blue(color));}

    private static void applyPalette(boolean night){
        if(night){
            BG=Color.rgb(18,17,22);SURFACE=Color.rgb(30,27,35);NAV=Color.rgb(24,21,29);
            PRIMARY=Color.rgb(208,188,255);PRIMARY_SOFT=Color.rgb(79,55,139);TEXT=Color.rgb(244,239,247);MUTED=Color.rgb(199,193,204);
            GOOD=Color.rgb(143,213,171);GOOD_SOFT=Color.rgb(24,58,40);WARN=Color.rgb(255,184,108);WARN_SOFT=Color.rgb(74,45,10);BAD=Color.rgb(255,180,171);BAD_SOFT=Color.rgb(96,20,16);
            ACTION=Color.rgb(43,39,48);OUTLINE=Color.rgb(73,69,79);PLACEHOLDER=Color.rgb(49,45,54);FAVORITE=Color.rgb(255,202,40);
        }else{
            BG=Color.rgb(246,244,250);SURFACE=Color.WHITE;NAV=Color.rgb(243,241,245);
            PRIMARY=Color.rgb(103,80,164);PRIMARY_SOFT=Color.rgb(234,221,255);TEXT=Color.rgb(32,30,36);MUTED=Color.rgb(104,99,110);
            GOOD=Color.rgb(38,116,80);GOOD_SOFT=Color.rgb(217,240,226);WARN=Color.rgb(160,90,0);WARN_SOFT=Color.rgb(255,240,214);BAD=Color.rgb(179,38,30);BAD_SOFT=Color.rgb(249,222,220);
            ACTION=Color.rgb(231,228,234);OUTLINE=Color.rgb(121,116,126);PLACEHOLDER=Color.rgb(235,232,239);FAVORITE=Color.rgb(232,170,0);
        }
    }

    static int dp(Context c,int value){return (int)(value*c.getResources().getDisplayMetrics().density+0.5f);}
    static GradientDrawable rounded(int color,float radiusDp,Context c){GradientDrawable d=new GradientDrawable();d.setColor(color);d.setCornerRadius(dp(c,(int)radiusDp));return d;}
    static GradientDrawable outlined(int fill,int stroke,float radiusDp,Context c){GradientDrawable d=rounded(fill,radiusDp,c);d.setStroke(dp(c,1),stroke);return d;}
    static TextView text(Context c,String s,float sp,int color,boolean bold){TextView v=new TextView(c);v.setText(s);v.setTextSize(sp);v.setTextColor(color);v.setTypeface(Typeface.DEFAULT,bold?Typeface.BOLD:Typeface.NORMAL);v.setLineSpacing(0,1.08f);return v;}
    static LinearLayout card(Context c){int radius=ThemePackStore.cardRadiusDp(c);LinearLayout l=new LinearLayout(c);l.setOrientation(LinearLayout.VERTICAL);l.setPadding(dp(c,18),dp(c,16),dp(c,18),dp(c,16));l.setBackground(rounded(SURFACE,radius,c));LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(-1,-2);p.setMargins(dp(c,12),dp(c,7),dp(c,12),dp(c,7));l.setLayoutParams(p);return l;}
    static TextView pill(Context c,String label,int bg,int fg){TextView v=text(c,label,12,fg,true);v.setGravity(Gravity.CENTER);v.setPadding(dp(c,10),dp(c,5),dp(c,10),dp(c,5));v.setBackground(rounded(bg,14,c));return v;}
    static void stylePill(TextView v,Context c,String label,int bg,int fg){v.setText(label);v.setTextColor(fg);v.setTypeface(Typeface.DEFAULT,Typeface.BOLD);v.setBackground(rounded(bg,14,c));v.setPadding(dp(c,10),dp(c,5),dp(c,10),dp(c,5));}
    static Button button(Context c,String label,View.OnClickListener action,boolean compact){Button b=new Button(c);b.setText(label);b.setAllCaps(false);b.setTextColor(PRIMARY);b.setTextSize(compact?13f:14f);b.setMinHeight(dp(c,compact?44:48));b.setMinimumHeight(dp(c,compact?44:48));b.setPadding(dp(c,compact?12:16),dp(c,8),dp(c,compact?12:16),dp(c,8));b.setBackground(rounded(ACTION,Math.min(14,ThemePackStore.cardRadiusDp(c)),c));b.setOnClickListener(action);return b;}
    static ImageButton iconButton(Context c,int icon,String description,View.OnClickListener action){ImageButton b=new ImageButton(c);int size=dp(c,48);b.setLayoutParams(new LinearLayout.LayoutParams(size,size));b.setMinimumWidth(0);b.setMinimumHeight(0);b.setPadding(dp(c,12),dp(c,12),dp(c,12),dp(c,12));b.setImageResource(icon);b.setColorFilter(PRIMARY);b.setBackground(rounded(ACTION,14,c));b.setContentDescription(description);b.setScaleType(ImageButton.ScaleType.CENTER_INSIDE);b.setOnClickListener(action);return b;}
    static void styleField(EditText e,Context c){e.setTextColor(TEXT);e.setHintTextColor(MUTED);e.setBackground(outlined(SURFACE,OUTLINE,Math.min(14,ThemePackStore.cardRadiusDp(c)),c));e.setPadding(dp(c,12),dp(c,8),dp(c,12),dp(c,8));e.setMinHeight(dp(c,48));}
    static void gap(LinearLayout parent,Context c,int dp){View v=new View(c);v.setLayoutParams(parent.getOrientation()==LinearLayout.HORIZONTAL?new LinearLayout.LayoutParams(Ui.dp(c,dp),1):new LinearLayout.LayoutParams(1,Ui.dp(c,dp)));parent.addView(v);}
}