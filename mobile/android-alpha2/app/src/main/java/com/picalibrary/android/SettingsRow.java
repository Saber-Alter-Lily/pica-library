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
        TextView name=Ui.text(c,title,16,Ui.TEXT,true);
        if(status!=null&&!status.isEmpty())row.addView(new ResponsivePair(c,name,Ui.text(c,status,13,statusColor(status),false)),new LinearLayout.LayoutParams(0,-2,1));
        else row.addView(name,new LinearLayout.LayoutParams(0,-2,1));
        if(action!=null){TextView arrow=Ui.text(c,"›",24,Ui.MUTED,false);arrow.setPadding(Ui.dp(c,10),0,0,0);row.addView(arrow);}
        return row;
    }

    /** Grouped account/status panel using exactly the same outer width, radius and margins as row(). */
    static LinearLayout panel(Context c,View.OnClickListener action){return container(c,true,action);}

    private static LinearLayout container(Context c,boolean vertical,View.OnClickListener action){
        LinearLayout view=new LinearLayout(c);view.setOrientation(vertical?LinearLayout.VERTICAL:LinearLayout.HORIZONTAL);view.setPadding(Ui.dp(c,16),Ui.dp(c,12),Ui.dp(c,12),Ui.dp(c,12));view.setMinimumHeight(Ui.dp(c,56));view.setBackground(Ui.rounded(Ui.SURFACE,Math.min(14,ThemePackStore.cardRadiusDp(c)),c));
        if(action!=null){view.setBackground(Ui.pressable(c,Ui.SURFACE,Math.min(14,ThemePackStore.cardRadiusDp(c))));view.setOnClickListener(action);view.setClickable(true);view.setFocusable(true);}
        LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(-1,-2);lp.setMargins(0,0,0,Ui.dp(c,8));view.setLayoutParams(lp);return view;
    }

    static LinearLayout statusLine(Context c,String title,String status){return statusLine(c,title,Ui.text(c,status,13,statusColor(status),true));}
    static LinearLayout statusLine(Context c,String title,TextView state){
        LinearLayout row=new ResponsivePair(c,Ui.text(c,title,14,Ui.TEXT,false),state);row.setPadding(0,Ui.dp(c,6),0,Ui.dp(c,6));return row;
    }
    private static final class ResponsivePair extends LinearLayout {
        final TextView name,state;int layoutMode=-1;
        ResponsivePair(Context c,TextView n,TextView s){super(c);name=n;state=s;addView(n);addView(s);setGravity(Gravity.CENTER_VERTICAL);}
        @Override protected void onMeasure(int w,int h){
            int gap=Ui.dp(getContext(),8),available=View.MeasureSpec.getSize(w)-getPaddingLeft()-getPaddingRight();
            boolean below=View.MeasureSpec.getMode(w)!=View.MeasureSpec.UNSPECIFIED &&
                    name.getPaint().measureText(name.getText().toString())+state.getPaint().measureText(state.getText().toString())+gap>available;
            int mode=below?VERTICAL:HORIZONTAL;
            if(layoutMode!=mode){layoutMode=mode;setOrientation(mode);name.setLayoutParams(new LayoutParams(below?-1:0,-2,below?0:1));state.setLayoutParams(new LayoutParams(below?-1:-2,-2));state.setGravity(below?Gravity.START:Gravity.END|Gravity.CENTER_VERTICAL);state.setPaddingRelative(below?0:gap,below?Ui.dp(getContext(),3):0,0,0);}
            super.onMeasure(w,h);
        }
    }
    static int statusColor(String status){if(status==null)return Ui.MUTED;if(status.contains("异常")||status.contains("失效")||status.contains("不可用")||status.contains("无权限")||status.contains("失败"))return Ui.BAD;if(status.contains("未")||status.contains("未知"))return Ui.MUTED;if(status.contains("可用")||status.contains("已连接")||status.contains("已登录")||status.contains("已同步"))return Ui.GOOD;return Ui.MUTED;}
}
