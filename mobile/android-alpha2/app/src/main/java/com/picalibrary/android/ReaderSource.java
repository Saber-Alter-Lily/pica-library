package com.picalibrary.android;

/** App source authorization and compatibility; chapter/Reader API is in :reader-view. */
interface ReaderSource extends ReaderChapterSource {
    default com.picalibrary.android.sources.SourceAccessPolicy.Access sourceAccess(){return null;}

    // Preserve the original short, atomic cache-write authorization fence.
    default void commitImageCache(ReaderImageTransport.CacheWrite write){
        SourceAccess.commit(sourceAccess(),()->{write.run();return null;});
    }
    default boolean isAccessRevoked(Throwable error){
        return error instanceof com.picalibrary.android.sources.SourceAccessPolicy.Disabled;
    }
}
