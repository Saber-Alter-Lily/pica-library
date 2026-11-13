package com.picalibrary.android;

import android.app.Activity;
import android.content.Intent;
import android.widget.LinearLayout;
import android.widget.Toast;

final class SourceAccessUi {
    private SourceAccessUi(){}
    static boolean require(Activity activity,String id){
        if(SourceAccess.enabled(activity,id))return true;
        Toast.makeText(activity,R.string.source_disabled,Toast.LENGTH_LONG).show();
        activity.startActivity(new Intent(activity,SourceChoicesActivity.class));return false;
    }
    static void entry(Activity activity,LinearLayout content){
        content.addView(SettingsRow.row(activity,activity.getString(R.string.source_choices_title),activity.getString(R.string.source_choices_summary),v->activity.startActivity(new Intent(activity,SourceChoicesActivity.class))));
    }
    static void run(Activity activity,String id,Runnable action){
        if(!require(activity,id))return;
        try{action.run();}catch(com.picalibrary.android.sources.SourceAccessPolicy.Disabled stopped){Toast.makeText(activity,R.string.source_disabled,Toast.LENGTH_LONG).show();activity.startActivity(new Intent(activity,SourceChoicesActivity.class));}
    }
    static String status(Activity activity,String id,String connected){return SourceAccess.enabled(activity,id)?connected:activity.getString(R.string.source_disabled);}
}
