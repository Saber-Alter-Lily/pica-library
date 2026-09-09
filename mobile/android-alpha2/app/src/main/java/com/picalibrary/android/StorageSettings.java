package com.picalibrary.android;

import android.content.Context;
import android.content.SharedPreferences;

final class StorageSettings {
    static final long UNLIMITED = -1L;
    static final long DEFAULT_PAGE_MB = 1024;
    static final long DEFAULT_COVER_MB = 256;
    static final int DEFAULT_PREFETCH = 3;
    static final long[] PAGE_MB = {256,512,1024,2048,5120,10240,UNLIMITED};
    static final long[] COVER_MB = {64,128,256,512,1024,UNLIMITED};
    static final int[] PREFETCH = {0,1,2,3,5,10};

    private static final String PREFS="mobile-storage-v1";
    private static final String PAGE="pageMb";
    private static final String COVER="coverMb";
    private static final String PREFETCH_KEY="prefetchPages";
    private static final String CACHE_EXTERNAL="cacheExternal";
    private static final String DATA_EXTERNAL="dataExternal";
    private static final String DOWNLOAD_TREE="downloadTreeUri";

    private StorageSettings(){}
    private static SharedPreferences prefs(Context c){return c.getSharedPreferences(PREFS,Context.MODE_PRIVATE);}

    static long pageMb(Context c){return prefs(c).getLong(PAGE,DEFAULT_PAGE_MB);}
    static long coverMb(Context c){return prefs(c).getLong(COVER,DEFAULT_COVER_MB);}
    static long pageLimitBytes(Context c){return bytes(pageMb(c));}
    static long coverLimitBytes(Context c){return bytes(coverMb(c));}
    static int prefetchPages(Context c){int v=prefs(c).getInt(PREFETCH_KEY,DEFAULT_PREFETCH);for(int allowed:PREFETCH)if(v==allowed)return v;return DEFAULT_PREFETCH;}
    static boolean cacheExternal(Context c){return prefs(c).getBoolean(CACHE_EXTERNAL,false);}
    static boolean dataExternal(Context c){return prefs(c).getBoolean(DATA_EXTERNAL,false);}
    static String downloadTreeUri(Context c){return prefs(c).getString(DOWNLOAD_TREE,"");}

    static void setPageMb(Context c,long mb){prefs(c).edit().putLong(PAGE,allowed(mb,PAGE_MB,DEFAULT_PAGE_MB)).apply();StoragePolicy.maintain(c);}
    static void setCoverMb(Context c,long mb){prefs(c).edit().putLong(COVER,allowed(mb,COVER_MB,DEFAULT_COVER_MB)).apply();StoragePolicy.maintain(c);}
    static void setPrefetchPages(Context c,int pages){int safe=DEFAULT_PREFETCH;for(int v:PREFETCH)if(v==pages)safe=v;prefs(c).edit().putInt(PREFETCH_KEY,safe).apply();}
    static void setCacheExternal(Context c,boolean external){prefs(c).edit().putBoolean(CACHE_EXTERNAL,external).apply();}
    static void setDataExternal(Context c,boolean external){prefs(c).edit().putBoolean(DATA_EXTERNAL,external).apply();}
    static void setDownloadTreeUri(Context c,String uri){prefs(c).edit().putString(DOWNLOAD_TREE,uri==null?"":uri).apply();}

    static String limitLabel(long mb){if(mb==UNLIMITED)return "不限";if(mb<1024)return mb+" MB";return (mb/1024)+" GB";}
    private static long bytes(long mb){return mb==UNLIMITED?Long.MAX_VALUE:Math.max(1,mb)*1024L*1024L;}
    private static long allowed(long value,long[] values,long fallback){for(long item:values)if(item==value)return item;return fallback;}
}
