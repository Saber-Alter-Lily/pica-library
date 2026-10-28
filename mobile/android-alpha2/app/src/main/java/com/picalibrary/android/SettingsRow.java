package com.picalibrary.android;

import android.content.Context;
import android.view.Gravity;
import android.view.View;
import android.widget.LinearLayout;
import android.widget.TextView;

/** Compact list-row primitive for Settings/account screens; no explanatory copy by default. */
final class SettingsRow {
    private SettingsRow(){}

    static LinearLayout row(Context c,String title,String status,View.OnClickListener action){
        LinearLayout row=container(c,false,action);row.setGravity(Gravity.CENTER_VERTICAL);
        boolean hasStatus=status!=null&&!status.isEmpty();
        TextView name=Ui.text(c,title,16,Ui.TEXT,true);
        // Stacking at enlarged system fonts prevents orphaned CJK title glyphs
        // in the 360dp source/settings hub while preserving the normal compact rows.
        final android.content.res.Configuration configuration=c.getResources().getConfiguration();
        boolean stackStatus=hasStatus&&configuration.fontScale>=1.3f
            &&configuration.screenWidthDp>0&&configuration.screenWidthDp<=480;
        if(stackStatus){
            LinearLayout labels=new LinearLayout(c);
            labels.setOrientation(LinearLayout.VERTICAL);
            labels.addView(name,new LinearLayout.LayoutParams(-1,-2));
            TextView state=Ui.text(c,status,13,statusColor(status),false);
            state.setGravity(Gravity.START|Gravity.CENTER_VERTICAL);
            state.setPadding(0,Ui.dp(c,4),0,0);
            labels.addView(state,new LinearLayout.LayoutParams(-1,-2));
            row.addView(labels,new LinearLayout.LayoutParams(0,-2,1f));
        }else{
            // With normal font sizes, retain bounded side-by-side columns.
            row.addView(name,new LinearLayout.LayoutParams(0,-2,hasStatus?1.15f:1f));
            if(hasStatus){
                TextView state=Ui.text(c,status,13,statusColor(status),false);
                state.setGravity(Gravity.END|Gravity.CENTER_VERTICAL);
                row.addView(state,new LinearLayout.LayoutParams(0,-2,1f));
            }
        }
        if(action!=null){TextView arrow=Ui.text(c,"›",24,Ui.MUTED,false);arrow.setPadding(Ui.dp(c,10),0,0,0);row.addView(arrow);}
        return row;
    }

    /** Grouped account/status panel using exactly the same outer width, radius and margins as row(). */
    static LinearLayout panel(Context c,View.OnClickListener action){return container(c,true,action);}

    private static LinearLayout container(Context c,boolean vertical,View.OnClickListener action){
        LinearLayout view=new LinearLayout(c);view.setOrientation(vertical?LinearLayout.VERTICAL:LinearLayout.HORIZONTAL);view.setPadding(Ui.dp(c,16),Ui.dp(c,12),Ui.dp(c,12),Ui.dp(c,12));view.setMinimumHeight(Ui.dp(c,56));view.setBackground(Ui.rounded(Ui.SURFACE,Math.min(14,ThemePackStore.cardRadiusDp(c)),c));
        if(action!=null){view.setOnClickListener(action);view.setClickable(true);view.setFocusable(true);}
        LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(-1,-2);lp.setMargins(0,0,0,Ui.dp(c,8));view.setLayoutParams(lp);return view;
    }

    static LinearLayout statusLine(Context c,String title,String status){return statusLine(c,title,Ui.text(c,status,13,statusColor(status),true));}
    static LinearLayout statusLine(Context c,String title,TextView state){
        LinearLayout row=new LinearLayout(c);row.setGravity(Gravity.CENTER_VERTICAL);row.setPadding(0,Ui.dp(c,6),0,Ui.dp(c,6));
        android.content.res.Configuration config=c.getResources().getConfiguration();
        boolean stack=config.fontScale>=1.3f&&config.screenWidthDp>0&&config.screenWidthDp<=480;
        if(stack){
            // Fully visible technical identifiers should not break into single-character
            // fragments in the 150%-font profile and account status cards.
            row.setOrientation(LinearLayout.VERTICAL);
            row.addView(Ui.text(c,title,14,Ui.TEXT,false),new LinearLayout.LayoutParams(-1,-2));
            state.setGravity(Gravity.START|Gravity.CENTER_VERTICAL);
            state.setPadding(0,Ui.dp(c,4),0,0);
            row.addView(state,new LinearLayout.LayoutParams(-1,-2));
        }else{
            row.addView(Ui.text(c,title,14,Ui.TEXT,false),new LinearLayout.LayoutParams(0,-2,1.15f));
            state.setGravity(Gravity.END|Gravity.CENTER_VERTICAL);
            row.addView(state,new LinearLayout.LayoutParams(0,-2,1f));
        }
        return row;
    }
    static int statusColor(String status){if(status==null)return Ui.MUTED;if(status.contains("可用")||status.contains("已连接")||status.contains("已登录")||status.contains("已同步"))return Ui.GOOD;if(status.contains("异常")||status.contains("失效")||status.contains("无权限")||status.contains("失败"))return Ui.BAD;return Ui.MUTED;}
}
