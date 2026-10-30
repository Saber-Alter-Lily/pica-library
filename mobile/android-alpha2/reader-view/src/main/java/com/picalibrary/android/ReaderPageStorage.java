package com.picalibrary.android;

import android.content.Context;
import java.io.File;

/** Existing app cache configuration supplied to the reusable Reader image pipeline. */
interface ReaderPageStorage {
    File cacheDir(Context context,String name);
    File cacheRoot(Context context);
    long pageLimitBytes(Context context);
    String failurePrefix(Context context);
    String disabledMessage(Context context);
}
