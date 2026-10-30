package com.picalibrary.android;

import android.content.Context;
import java.io.File;

/** Original ReaderImages API; one actual image pipeline lives in :reader-view. */
final class ReaderImages extends ReaderImageLoader {
    private static final ReaderPageStorage STORAGE=new ReaderPageStorage() {
        public File cacheDir(Context context,String name){return MobileStoragePaths.cacheDir(context,name);}
        public File cacheRoot(Context context){return MobileStoragePaths.cacheRoot(context);}
        public long pageLimitBytes(Context context){return StorageSettings.pageLimitBytes(context);}
        public String failurePrefix(Context context){return LocalizedText.ui("图片读取失败 · ");}
        public String disabledMessage(Context context){return context.getString(R.string.source_disabled);}
    };

    ReaderImages(Context context,ReaderChapterSource source){super(context,source,STORAGE);}
    static long cacheBytes(Context context){return ReaderImageLoader.cacheBytes(context,STORAGE);}
    static void clearCache(Context context){ReaderImageLoader.clearCache(context,STORAGE);}
}
