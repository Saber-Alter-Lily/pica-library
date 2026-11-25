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
        int[] icons={R.drawable.qa_nav_library,R.drawable.qa_nav_recommend,R.drawable.qa_nav_online,R.drawable.qa_nav_settings};
        nav.setPadding(Ui.dp(activity,4),Ui.dp(activity,3),Ui.dp(activity,4),Ui.dp(activity,3));
        for(int i=0;i<labels.length;i++){
            final int tab=i;boolean active=tab==selected;
            Button b=new Button(activity);b.setTag("pica-tour-nav-"+tab);b.setText(LocalizedText.ui(labels[i]));b.setTextSize(12);b.setAllCaps(false);
            b.setSelected(active);b.setContentDescription(LocalizedText.ui(labels[i]));b.setTextColor(active?Ui.PRIMARY:Ui.MUTED);b.setGravity(Gravity.CENTER);
            b.setMinWidth(0);b.setMinimumWidth(0);b.setMinHeight(Ui.dp(activity,52));b.setMinimumHeight(Ui.dp(activity,52));b.setPadding(0,Ui.dp(activity,4),0,Ui.dp(activity,3));
            b.setBackground(Ui.pressable(activity,active?Ui.PRIMARY_SOFT:Color.TRANSPARENT,16));
            android.graphics.drawable.Drawable icon=ThemePackStore.navDrawable(activity,labels[i]);
            if(icon==null){icon=activity.getDrawable(icons[tab]).mutate();icon.setTint(active?Ui.PRIMARY:Ui.MUTED);}
            int size=Ui.dp(activity,20);icon.setBounds(0,0,size,size);b.setCompoundDrawables(null,icon,null,null);b.setCompoundDrawablePadding(Ui.dp(activity,2));
            String typo=ThemePackStore.navigationTypography(activity);if(active||"comic".equals(typo)||"cute".equals(typo))b.setTypeface(android.graphics.Typeface.DEFAULT,android.graphics.Typeface.BOLD);
            b.setOnClickListener(v->navigate(activity,selected,tab));LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(0,-2,1);
            lp.setMargins(Ui.dp(activity,2),0,Ui.dp(activity,2),0);nav.addView(b,lp);
        }
        return nav;
    }
    private static void navigate(Activity activity,int selected,int target){if(target==selected&&activity instanceof HomeActivity)return;Intent i=new Intent(activity,HomeActivity.class);i.putExtra("tab",target);i.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP|Intent.FLAG_ACTIVITY_SINGLE_TOP);activity.startActivity(i);if(!(activity instanceof HomeActivity))activity.finish();}
}
