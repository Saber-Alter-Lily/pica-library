package com.picalibrary.android;

import android.app.Activity;
import android.content.Context;
import android.os.Bundle;

/** Base Activity that applies the persisted app locale before UI construction and recreates after a language change. */
abstract class LocaleAwareActivity extends Activity {
    private String appliedLanguage;

    @Override protected void attachBaseContext(Context base){
        super.attachBaseContext(LocaleStore.wrap(base));
    }

    @Override protected void onCreate(Bundle state){
        super.onCreate(state);
        appliedLanguage=LocaleStore.language(this);
    }

    @Override protected void onResume(){
        super.onResume();
        String current=LocaleStore.language(this);
        if(appliedLanguage!=null&&!appliedLanguage.equals(current)){
            appliedLanguage=current;
            recreate();
        }
    }
}
