package com.picalibrary.android;

import android.content.Context;

/** Chooses a readable transport for a unified comic without exposing source tabs in UI. */
final class UnifiedSourceResolver {
    enum Source { PHONE_DOWNLOAD, DESKTOP, WEBDAV, PICA, NONE }
    static final class Resolution {
        final Source source;final String reason;
        Resolution(Source source,String reason){this.source=source;this.reason=reason;}
    }
    private UnifiedSourceResolver(){}

    static Resolution resolve(Context context,UnifiedCatalogStore.Entry entry){
        if(entry.phoneDownloaded)return new Resolution(Source.PHONE_DOWNLOAD,"手机已下载");
        if(entry.desktopDownloaded&&BridgeStore.paired(context))return new Resolution(Source.DESKTOP,"电脑已下载");
        if(entry.remoteAvailable&&RemoteConfigStore.load(context).configured())return new Resolution(Source.WEBDAV,"WebDAV 可读");
        if(entry.picaAvailable)return new Resolution(Source.PICA,"Pica 在线可读");
        return new Resolution(Source.NONE,"当前没有可用正文来源");
    }
}
