package com.picalibrary.android;

import java.util.ArrayList;
import java.util.List;

/** Stable Alpha7 source priority. UI must not force a transport choice per page. */
final class SourcePolicy {
    enum Kind { PHONE_CACHE, DESKTOP_LAN, REMOTE_STORAGE, PICA_ONLINE }

    private SourcePolicy() {}

    static List<Kind> readerOrder(boolean desktopReachable, boolean remoteConfigured, boolean onlineAuthenticated) {
        List<Kind> order = new ArrayList<>();
        order.add(Kind.PHONE_CACHE);
        if (desktopReachable) order.add(Kind.DESKTOP_LAN);
        if (remoteConfigured) order.add(Kind.REMOTE_STORAGE);
        if (onlineAuthenticated) order.add(Kind.PICA_ONLINE);
        return order;
    }

    static boolean canReadWithoutDesktop(boolean remoteConfigured, boolean onlineAuthenticated) {
        return remoteConfigured || onlineAuthenticated;
    }
}
