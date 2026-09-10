package com.picalibrary.android;

import android.content.Context;
import java.io.File;
import java.util.*;

/** Central inventory/maintenance for disposable mobile caches only. */
final class StoragePolicy {
    static final long REMOTE_METADATA_LIMIT_BYTES=64L*1024*1024;
    static final class Usage {final long pages,covers,metadata,total;Usage(long pages,long covers,long metadata){this.pages=pages;this.covers=covers;this.metadata=metadata;this.total=pages+covers+metadata;}}
    private StoragePolicy(){}
    private static File root(Context context,String name){return MobileStoragePaths.cacheDir(context,name);}
    private static File internal(Context context,String name){return new File(context.getFilesDir(),name);}
    private static boolean same(File left,File right){try{return left.getCanonicalFile().equals(right.getCanonicalFile());}catch(Exception e){return left.equals(right);}}
    private static long bytes(File file){if(file==null||!file.exists())return 0;if(file.isFile())return file.length();long total=0;File[] children=file.listFiles();if(children!=null)for(File child:children)total+=bytes(child);return total;}
    private static long bytesDistinct(File first,File second){return bytes(first)+(same(first,second)?0:bytes(second));}
    private static void delete(File file){if(file==null||!file.exists())return;if(file.isDirectory()){File[] children=file.listFiles();if(children!=null)for(File child:children)delete(child);}file.delete();}
    private static void collect(File file,List<File> out){if(file==null||!file.exists())return;if(file.isFile()){if(!file.getName().endsWith(".part")&&!file.getName().endsWith(".tmp"))out.add(file);return;}File[] children=file.listFiles();if(children!=null)for(File child:children)collect(child,out);}
    private static synchronized void trim(File root,long limit){if(limit==Long.MAX_VALUE||root==null||!root.exists())return;List<File> files=new ArrayList<>();collect(root,files);files.sort(Comparator.comparingLong(File::lastModified));long total=0;for(File file:files)total+=file.length();for(File file:files){if(total<=limit)break;long size=file.length();if(file.delete())total-=size;}}
    private static synchronized void trimTogether(File first,File second,long limit){if(limit==Long.MAX_VALUE)return;List<File> files=new ArrayList<>();collect(first,files);if(!same(first,second))collect(second,files);files.sort(Comparator.comparingLong(File::lastModified));long total=0;for(File file:files)total+=file.length();for(File file:files){if(total<=limit)break;long size=file.length();if(file.delete())total-=size;}}

    static Usage usage(Context context){File page=root(context,"reader-pages-v2"),cover=root(context,"cover-cache-v2"),desktopLegacy=root(context,"desktop-cover-cache-v1"),remoteLegacy=root(context,"remote-covers-v1"),remoteLegacyInternal=internal(context,"remote-covers-v1"),metadata=root(context,"remote-metadata-v1"),metadataInternal=internal(context,"remote-metadata-v1");long pages=bytes(page);long covers=bytes(cover)+bytes(desktopLegacy)+bytesDistinct(remoteLegacy,remoteLegacyInternal);long metadataBytes=bytesDistinct(metadata,metadataInternal)+bytes(MobileStoragePaths.dataFile(context,"favorite-catalog-v1.json"))+bytes(MobileStoragePaths.dataFile(context,"portable-shelves-v1.json"))+bytes(MobileStoragePaths.dataFile(context,"unified-catalog-v1.json"));return new Usage(pages,covers,metadataBytes);}
    static void maintain(Context context){trim(root(context,"reader-pages-v2"),StorageSettings.pageLimitBytes(context));trim(root(context,"cover-cache-v2"),StorageSettings.coverLimitBytes(context));trimTogether(root(context,"remote-metadata-v1"),internal(context,"remote-metadata-v1"),REMOTE_METADATA_LIMIT_BYTES);/* legacy cover roots are cleanup-only and no longer written by unified UI */trim(root(context,"desktop-cover-cache-v1"),StorageSettings.coverLimitBytes(context));trimTogether(root(context,"remote-covers-v1"),internal(context,"remote-covers-v1"),StorageSettings.coverLimitBytes(context));}
    static void clearPages(Context context){ReaderImages.clearCache(context);}
    static void clearCovers(Context context){CoverRepository.clear(context);ImageRepository.clearDisk(context);delete(root(context,"remote-covers-v1"));File legacy=internal(context,"remote-covers-v1");if(!same(root(context,"remote-covers-v1"),legacy))delete(legacy);}
    static void clearMetadata(Context context){delete(root(context,"remote-metadata-v1"));File legacy=internal(context,"remote-metadata-v1");if(!same(root(context,"remote-metadata-v1"),legacy))delete(legacy);FavoriteCacheStore.clear(context);File shelf=MobileStoragePaths.dataFile(context,"portable-shelves-v1.json");if(shelf.exists())shelf.delete();}
    static void clearAllCaches(Context context){clearPages(context);clearCovers(context);clearMetadata(context);}
}
