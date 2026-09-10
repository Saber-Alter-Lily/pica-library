package com.picalibrary.android;

import android.content.Context;
import java.util.*;

/** Maps catalog availability to the stable provider order. Reachability is checked asynchronously. */
final class UnifiedSourceResolver {
    enum Source { PHONE_DOWNLOAD, DESKTOP, WEBDAV, PICA, NONE }
    static final class Resolution {final Source source;final String reason;Resolution(Source source,String reason){this.source=source;this.reason=reason;}}
    private UnifiedSourceResolver(){}
    static List<Source> candidates(Context context,UnifiedCatalogStore.Entry entry){boolean phone=entry.phoneDownloaded||PhoneDownloadStore.has(context,entry.id),desktop=entry.desktopDownloaded&&BridgeStore.paired(context),remote=entry.remoteAvailable&&RemoteConfigStore.load(context).configured(),pica=entry.picaAvailable||PicaAccountStore.load(context).configured();List<Source> out=new ArrayList<>();for(SourcePolicy.Kind kind:SourcePolicy.readerOrder(phone,desktop,remote,pica)){if(kind==SourcePolicy.Kind.PHONE_DOWNLOAD)out.add(Source.PHONE_DOWNLOAD);else if(kind==SourcePolicy.Kind.DESKTOP_LAN)out.add(Source.DESKTOP);else if(kind==SourcePolicy.Kind.REMOTE_STORAGE)out.add(Source.WEBDAV);else if(kind==SourcePolicy.Kind.PICA_ONLINE)out.add(Source.PICA);}return out;}
    static Resolution resolve(Context context,UnifiedCatalogStore.Entry entry){List<Source> values=candidates(context,entry);if(values.isEmpty())return new Resolution(Source.NONE,"当前没有可用正文来源");Source source=values.get(0);if(source==Source.PHONE_DOWNLOAD)return new Resolution(source,"手机已下载");if(source==Source.DESKTOP)return new Resolution(source,"电脑已下载");if(source==Source.WEBDAV)return new Resolution(source,"WebDAV 可读");return new Resolution(source,"Pica 在线候选");}
}
