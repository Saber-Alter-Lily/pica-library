package com.picalibrary.android;

import android.content.Context;
import java.util.*;

/** Stable provider priority. Explicit phone downloads precede disposable page cache. */
final class SourcePolicy {
    enum Kind { PHONE_DOWNLOAD, PHONE_CACHE, DESKTOP_LAN, REMOTE_STORAGE, PICA_ONLINE }
    private SourcePolicy() {}
    static List<Kind> readerOrder(boolean phoneDownloaded,boolean desktopReachable,boolean remoteConfigured,boolean onlineAuthenticated) {List<Kind> order=new ArrayList<>();if(phoneDownloaded)order.add(Kind.PHONE_DOWNLOAD);order.add(Kind.PHONE_CACHE);if(desktopReachable)order.add(Kind.DESKTOP_LAN);if(remoteConfigured)order.add(Kind.REMOTE_STORAGE);if(onlineAuthenticated)order.add(Kind.PICA_ONLINE);return order;}
    static List<Kind> readerOrder(boolean desktopReachable,boolean remoteConfigured,boolean onlineAuthenticated){return readerOrder(false,desktopReachable,remoteConfigured,onlineAuthenticated);}
    static boolean canReadWithoutDesktop(boolean remoteConfigured,boolean onlineAuthenticated){return remoteConfigured||onlineAuthenticated;}
}
