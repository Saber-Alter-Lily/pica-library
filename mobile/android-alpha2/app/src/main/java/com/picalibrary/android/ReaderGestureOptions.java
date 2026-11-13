package com.picalibrary.android;

import android.app.AlertDialog;
import android.content.Context;

/** Retains the original app-facing Reader gesture API and current zh/en/ja copy. */
final class ReaderGestureOptions {
    private static final ReaderGesturePanel.Copy COPY=LocalizedText::ui;
    private ReaderGestureOptions(){}

    static String title(Context context){
        return ReaderGesturePanel.title(context,COPY);
    }

    static AlertDialog show(Context context,Runnable onChanged,Runnable onDismiss){
        return ReaderGesturePanel.show(context,COPY,onChanged,onDismiss);
    }
}
