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
        LinearLayout row=new LinearLayout(c);row.setGravity(Gravity.CENTER_VERTICAL);row.setPadding(Ui.dp(c,16),Ui.dp(c,12),Ui.dp(c,12),Ui.dp(c,12));row.setMinimumHeight(Ui.dp(c,56));row.setBackground(Ui.rounded(Ui.SURFACE,Math.min(14,ThemePackStore.cardRadiusDp(c)),c));
        TextView name=Ui.text(c,title,16,Ui.TEXT,true);row.addView(name,new LinearLayout.LayoutParams(0,-2,1));
        if(status!=null&&!status.isEmpty()){TextView state=Ui.text(c,status,13,statusColor(status),false);state.setGravity(Gravity.END|Gravity.CENTER_VERTICAL);row.addView(state);}
        if(action!=null){TextView arrow=Ui.text(c,"›",24,Ui.MUTED,false);arrow.setPadding(Ui.dp(c,10),0,0,0);row.addView(arrow);row.setOnClickListener(action);row.setClickable(true);row.setFocusable(true);}
        LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(-1,-2);lp.setMargins(0,0,0,Ui.dp(c,8));row.setLayoutParams(lp);return row;
    }
    static LinearLayout statusLine(Context c,String title,String status){
        LinearLayout row=new LinearLayout(c);row.setGravity(Gravity.CENTER_VERTICAL);row.setPadding(0,Ui.dp(c,6),0,Ui.dp(c,6));row.addView(Ui.text(c,title,14,Ui.TEXT,false),new LinearLayout.LayoutParams(0,-2,1));TextView state=Ui.text(c,status,13,statusColor(status),true);row.addView(state);return row;
    }
    private static int statusColor(String status){if(status==null)return Ui.MUTED;if(status.contains("可用")||status.contains("已连接")||status.contains("已登录")||status.contains("已同步"))return Ui.GOOD;if(status.contains("异常")||status.contains("失效")||status.contains("无权限")||status.contains("失败"))return Ui.BAD;return Ui.MUTED;}
}
