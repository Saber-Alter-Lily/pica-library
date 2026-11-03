package com.picalibrary.android;

/** Provider identity is data, not an API client. Keep it usable without networking. */
final class ComicIdFormat {
    private ComicIdFormat(){}
    static boolean isEhId(String value){
        return value!=null&&value.matches("^eh:\\d+:[0-9a-fA-F]{10}$");
    }
}
