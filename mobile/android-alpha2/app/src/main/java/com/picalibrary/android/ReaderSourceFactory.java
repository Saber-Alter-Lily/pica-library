package com.picalibrary.android;

import android.content.Context;

/** Preserve legacy Desktop intents, but never route an unknown explicit source to Desktop. */
final class ReaderSourceFactory {
    static String kind(String value) {
        if (value == null || value.isEmpty()) return "desktop";
        switch (value) {
            case "desktop": case "phone": case "remote": case "pica": case "eh": case "jm": return value;
            default: throw new IllegalArgumentException("不支持的阅读来源 / Unsupported reader source");
        }
    }
    static ReaderSource create(Context context, String value) {
        switch (kind(value)) {
            case "phone": return new PhoneDownloadReaderSource(context);
            case "remote": return new RemoteReaderSource(context);
            case "pica": return new PicaReaderSource(context);
            case "eh": return new EhReaderSource(context);
            case "jm": return new JmReaderSource(context);
            default: return new DesktopReaderSource(context);
        }
    }
    private ReaderSourceFactory() {}
}
