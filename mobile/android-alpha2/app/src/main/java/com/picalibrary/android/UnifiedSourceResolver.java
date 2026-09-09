package com.picalibrary.android;

import android.content.Context;
import java.util.ArrayList;
import java.util.List;

/** Chooses candidate transports without exposing source tabs in the library UI. */
final class UnifiedSourceResolver {
    enum Source { PHONE_DOWNLOAD, DESKTOP, WEBDAV, PICA, NONE }
    static final class Resolution {
        final Source source;final String reason;
        Resolution(Source source,String reason){this.source=source;this.reason=reason;}
    }
    private UnifiedSourceResolver(){}

    static List<Source> candidates(Context context,UnifiedCatalogStore.Entry entry){
        List<Source> out=new ArrayList<>();
        if(entry.phoneDownloaded)out.add(Source.PHONE_DOWNLOAD);
        if(entry.desktopDownloaded&&BridgeStore.paired(context))out.add(Source.DESKTOP);
        if(entry.remoteAvailable&&RemoteConfigStore.load(context).configured())out.add(Source.WEBDAV);
        if(entry.picaAvailable)out.add(Source.PICA);
        return out;
    }

    static Resolution resolve(Context context,UnifiedCatalogStore.Entry entry){
        List<Source> values=candidates(context,entry);if(values.isEmpty())return new Resolution(Source.NONE,"当前没有可用正文来源");Source source=values.get(0);
        if(source==Source.PHONE_DOWNLOAD)return new Resolution(source,"手机已下载");
        if(source==Source.DESKTOP)return new Resolution(source,"电脑已下载");
        if(source==Source.WEBDAV)return new Resolution(source,"WebDAV 可读");
        return new Resolution(source,"Pica 在线可读");
    }
}
