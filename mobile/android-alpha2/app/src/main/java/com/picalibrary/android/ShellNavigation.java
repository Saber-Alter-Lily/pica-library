package com.picalibrary.android;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;

/** Shared four-destination bottom navigation for top-level screens. */
final class ShellNavigation {
    private ShellNavigation(){}
    static LinearLayout build(Activity activity,int selected){
        LinearLayout nav=new LinearLayout(activity);nav.setBackgroundColor(Ui.NAV);String[] labels=ShellPolicy.bottomTabs();
        for(int i=0;i<labels.length;i++){final int tab=i;Button b=new Button(activity);b.setText(labels[i]);b.setTextSize(12.5f);b.setAllCaps(false);b.setTextColor(Ui.PRIMARY);b.setBackground(tab==selected?Ui.rounded(Ui.PRIMARY_SOFT,0,activity):Ui.rounded(Color.TRANSPARENT,0,activity));b.setMinWidth(0);b.setMinimumWidth(0);b.setMinHeight(Ui.dp(activity,48));b.setGravity(Gravity.CENTER);android.graphics.drawable.Drawable icon=ThemePackStore.navDrawable(activity,labels[i]);if(icon!=null){int size=Ui.dp(activity,20);icon.setBounds(0,0,size,size);b.setCompoundDrawables(null,icon,null,null);b.setCompoundDrawablePadding(Ui.dp(activity,1));}String typography=ThemePackStore.navigationTypography(activity);if("comic".equals(typography)||"cute".equals(typography))b.setTypeface(android.graphics.Typeface.DEFAULT,android.graphics.Typeface.BOLD);b.setOnClickListener(v->navigate(activity,selected,tab));nav.addView(b,new LinearLayout.LayoutParams(0,Ui.dp(activity,56),1));}
        return nav;
    }
    private static void navigate(Activity activity,int selected,int target){if(target==selected&&activity instanceof HomeActivity)return;Intent i=new Intent(activity,HomeActivity.class);i.putExtra("tab",target);i.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP|Intent.FLAG_ACTIVITY_SINGLE_TOP);activity.startActivity(i);if(!(activity instanceof HomeActivity))activity.finish();}
}
