package com.picalibrary.android;

import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.widget.TextView;

/** Original Android intent/manifest entry, now wiring app services to one source-neutral Reader screen. */
public class ReaderActivity extends ReaderScreenActivity {
    private String appliedLanguage;

    @Override protected void attachBaseContext(Context base){
        super.attachBaseContext(LocaleStore.wrap(base));
    }

    @Override public void onCreate(Bundle state){
        super.onCreate(state);
        appliedLanguage=LocaleStore.language(this);
    }

    @Override protected boolean readerLocaleChangedOnResume(){
        String current=LocaleStore.language(this);
        if(appliedLanguage!=null&&!appliedLanguage.equals(current)){
            appliedLanguage=current;
            recreate();
            return true;
        }
        return false;
    }

    @Override protected void onPostResume(){
        super.onPostResume();
        AndroidOnboarding.maybeStartAdvancedPageTour(this);
    }

    @Override protected ReaderChapterSource createReaderSource(String kind){
        return ReaderSourceFactory.create(this,kind);
    }

    @Override protected ReaderImageLoader createReaderImages(ReaderChapterSource source){
        return new ReaderImages(this,source);
    }

    @Override protected ReaderProgressLedger createReaderProgress(ReaderChapterSource source){
        return new ReaderProgress(this,source);
    }

    @Override protected ReaderDisplaySettings.Snapshot reconcileReaderSettings(){
        return ReaderSettingsStore.reconcile(this);
    }

    @Override protected void pushReaderSettings(){
        ReaderSettingsStore.pushAsync(this);
    }

    @Override protected int readerPrefetchPages(){
        return StorageSettings.prefetchPages(this);
    }

    @Override protected String translateReaderText(String source){
        return LocalizedText.ui(source);
    }

    // Preserve the original app-owned Ui.text typography and localized copy.
    @Override protected TextView readerText(String text,float sp,int color,boolean bold){
        return Ui.text(this,text,sp,color,bold);
    }

    @Override protected String readerGestureTitle(){
        return ReaderGestureOptions.title(this);
    }

    @Override protected void showReaderGestures(Runnable onChanged,Runnable onDismiss){
        ReaderGestureOptions.show(this,onChanged,onDismiss);
    }

    @Override protected void openReaderStorageSettings(){
        startActivity(new Intent(this,StorageSettingsActivity.class));
    }

    @Override protected void recordReaderComplete(Context context,String comicId){
        ReaderSourceFactory.recordReaderComplete(context,comicId);
    }
}
