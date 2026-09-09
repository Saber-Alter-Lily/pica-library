package com.picalibrary.android;

import android.content.Context;
import java.io.File;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;

/** Central inventory/maintenance policy for Android caches. User data and credentials are never deleted here. */
final class StoragePolicy {
    static final long PAGE_LIMIT_BYTES = 1024L * 1024 * 1024;
    static final long DESKTOP_COVER_LIMIT_BYTES = 256L * 1024 * 1024;
    static final long REMOTE_COVER_LIMIT_BYTES = 256L * 1024 * 1024;
    static final long REMOTE_METADATA_LIMIT_BYTES = 64L * 1024 * 1024;

    static final class Usage {
        final long pages,covers,metadata,total;
        Usage(long pages,long covers,long metadata){this.pages=pages;this.covers=covers;this.metadata=metadata;this.total=pages+covers+metadata;}
    }

    private StoragePolicy(){}

    private static File root(Context context,String name){return new File(context.getFilesDir(),name);}
    private static long bytes(File file){
        if(file==null||!file.exists())return 0;
        if(file.isFile())return file.length();
        long total=0;File[] children=file.listFiles();if(children!=null)for(File child:children)total+=bytes(child);return total;
    }
    private static void delete(File file){
        if(file==null||!file.exists())return;
        if(file.isDirectory()){File[] children=file.listFiles();if(children!=null)for(File child:children)delete(child);}
        file.delete();
    }
    private static void collect(File file,List<File> out){
        if(file==null||!file.exists())return;
        if(file.isFile()){if(!file.getName().endsWith(".part")&&!file.getName().endsWith(".tmp"))out.add(file);return;}
        File[] children=file.listFiles();if(children!=null)for(File child:children)collect(child,out);
    }
    private static synchronized void trim(File root,long limit){
        if(limit<=0||root==null||!root.exists())return;
        List<File> files=new ArrayList<>();collect(root,files);files.sort(Comparator.comparingLong(File::lastModified));long total=0;for(File file:files)total+=file.length();
        for(File file:files){if(total<=limit)break;long size=file.length();if(file.delete())total-=size;}
    }

    static Usage usage(Context context){
        long pages=bytes(root(context,"reader-pages-v2"));
        long covers=bytes(root(context,"desktop-cover-cache-v1"))+bytes(root(context,"remote-covers-v1"));
        long metadata=bytes(root(context,"remote-metadata-v1"))+bytes(root(context,"favorite-catalog-v1.json"))+bytes(root(context,"portable-shelves-v1.json"));
        return new Usage(pages,covers,metadata);
    }

    static void maintain(Context context){
        trim(root(context,"reader-pages-v2"),PAGE_LIMIT_BYTES);
        trim(root(context,"desktop-cover-cache-v1"),DESKTOP_COVER_LIMIT_BYTES);
        trim(root(context,"remote-covers-v1"),REMOTE_COVER_LIMIT_BYTES);
        trim(root(context,"remote-metadata-v1"),REMOTE_METADATA_LIMIT_BYTES);
    }

    static void clearPages(Context context){ReaderImages.clearCache(context);}
    static void clearCovers(Context context){ImageRepository.clearDisk(context);delete(root(context,"remote-covers-v1"));}
    static void clearMetadata(Context context){
        delete(root(context,"remote-metadata-v1"));
        FavoriteCacheStore.clear(context);
        delete(root(context,"portable-shelves-v1.json"));
    }
    static void clearAllCaches(Context context){clearPages(context);clearCovers(context);clearMetadata(context);}
}
