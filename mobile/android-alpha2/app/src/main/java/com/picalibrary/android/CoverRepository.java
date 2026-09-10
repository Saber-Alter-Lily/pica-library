package com.picalibrary.android;

import android.app.Activity;
import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.drawable.ColorDrawable;
import android.util.LruCache;
import android.widget.ImageView;
import java.io.*;
import java.net.HttpURLConnection;
import java.util.*;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * One cover cache for Desktop/WebDAV/Pica. A version key includes the comic identity,
 * current provider locators and stable catalog timestamp, so metadata/cover changes do
 * not reuse an older bitmap forever while unchanged sources still share one copy.
 */
final class CoverRepository {
    private static final String ROOT="cover-cache-v2";
    private static final int MEMORY_BYTES=72*1024*1024;
    private static final ExecutorService POOL=Executors.newFixedThreadPool(5);
    private static final LruCache<String,Bitmap> MEMORY=new LruCache<String,Bitmap>(MEMORY_BYTES){
        @Override protected int sizeOf(String key,Bitmap value){return value.getByteCount();}
    };
    private CoverRepository(){}

    private static File dir(Context context){return MobileStoragePaths.cacheDir(context,ROOT);}
    private static String value(String s){return s==null?"":s;}
    private static String key(UnifiedCatalogStore.Entry entry){return ReaderPolicy.hash(value(entry.id)+"\n"+value(entry.desktopCoverPath)+"\n"+value(entry.remoteCoverPath)+"\n"+value(entry.picaCoverUrl)+"\n"+value(entry.updatedAt));}
    private static File disk(Context context,String cacheKey){return new File(dir(context),cacheKey);}
    private static Bitmap memory(String cacheKey){synchronized(MEMORY){return MEMORY.get(cacheKey);}}
    private static void remember(String cacheKey,Bitmap bitmap){if(cacheKey==null||cacheKey.isEmpty()||bitmap==null)return;synchronized(MEMORY){MEMORY.put(cacheKey,bitmap);}}
    private static Bitmap diskHit(Context context,String cacheKey){File file=disk(context,cacheKey);if(!file.isFile())return null;Bitmap bitmap=BitmapFactory.decodeFile(file.getPath());if(bitmap==null){file.delete();return null;}file.setLastModified(System.currentTimeMillis());remember(cacheKey,bitmap);return bitmap;}

    static Bitmap cacheNow(Context context,UnifiedCatalogStore.Entry entry){
        if(entry==null||entry.id==null||entry.id.isEmpty())return null;String cacheKey=key(entry);Bitmap hit=memory(cacheKey);if(hit!=null)return hit;hit=diskHit(context,cacheKey);if(hit!=null)return hit;
        Bitmap bitmap=null;
        if(entry.desktopCoverPath!=null&&!entry.desktopCoverPath.isEmpty()&&BridgeStore.paired(context)){
            try{bitmap=BridgeClient.bitmap(context,entry.desktopCoverPath);}catch(Exception ignored){}
        }
        if(bitmap==null&&entry.remoteCoverPath!=null&&!entry.remoteCoverPath.isEmpty()&&RemoteConfigStore.load(context).configured()){
            HttpURLConnection c=null;try{c=new RemoteLibraryClient(context).open(entry.remoteCoverPath,"image/*");bitmap=decode(c,32L*1024*1024);}catch(Exception ignored){}finally{if(c!=null)c.disconnect();}
        }
        if(bitmap==null&&entry.picaCoverUrl!=null&&!entry.picaCoverUrl.isEmpty()){
            HttpURLConnection c=null;try{c=new PicaClient(context).media(entry.picaCoverUrl);bitmap=decode(c,32L*1024*1024);}catch(Exception ignored){}finally{if(c!=null)c.disconnect();}
        }
        if(bitmap==null&&PicaAccountStore.load(context).configured()){
            try{PicaClient client=new PicaClient(context);PicaClient.Comic comic=client.comic(entry.id);if(comic!=null&&!comic.id.isEmpty()){UnifiedCatalogStore.Entry refreshed=UnifiedPicaCatalogSync.merge(context,comic);if(!comic.coverUrl.isEmpty()){HttpURLConnection c=null;try{c=client.media(comic.coverUrl);bitmap=decode(c,32L*1024*1024);}finally{if(c!=null)c.disconnect();}}if(refreshed!=null)cacheKey=key(refreshed);}}catch(Exception ignored){}
        }
        if(bitmap!=null){remember(cacheKey,bitmap);save(context,cacheKey,bitmap);}return bitmap;
    }

    static boolean prefetchDesktop(Context context,String comicId,String path){
        if(comicId==null||comicId.isEmpty()||path==null||path.isEmpty())return false;UnifiedCatalogStore.Entry entry=UnifiedCatalogStore.load(context).byId.get(comicId);if(entry==null)entry=new UnifiedCatalogStore.Entry(comicId,"","");entry.desktopCoverPath=path;String cacheKey=key(entry);if(memory(cacheKey)!=null||disk(context,cacheKey).isFile())return true;
        try{Bitmap bitmap=BridgeClient.bitmap(context,path);if(bitmap==null)return false;remember(cacheKey,bitmap);save(context,cacheKey,bitmap);return true;}catch(Exception e){return false;}
    }

    static void load(Activity activity,ImageView target,UnifiedCatalogStore.Entry entry,int placeholderColor){
        if(entry==null||entry.id==null||entry.id.isEmpty()){target.setImageDrawable(new ColorDrawable(placeholderColor));return;}String cacheKey=key(entry);String tag="cover-comic:"+entry.id;target.setTag(tag);Bitmap hit=memory(cacheKey);if(hit==null)hit=diskHit(activity,cacheKey);if(hit!=null){target.setImageBitmap(hit);return;}target.setImageDrawable(new ColorDrawable(placeholderColor));
        POOL.submit(()->{Bitmap bitmap=cacheNow(activity.getApplicationContext(),entry);if(bitmap==null)return;activity.runOnUiThread(()->{Object current=target.getTag();if(current!=null&&tag.equals(current.toString()))target.setImageBitmap(bitmap);});});
    }

    static void prefetch(Context context,UnifiedCatalogStore.Entry entry){if(entry==null||entry.id==null||entry.id.isEmpty())return;String cacheKey=key(entry);if(memory(cacheKey)!=null||disk(context,cacheKey).isFile())return;POOL.submit(()->cacheNow(context.getApplicationContext(),entry));}

    private static Bitmap decode(HttpURLConnection c,long limit) throws Exception {int status=c.getResponseCode();if(status<200||status>=300)throw new IOException("cover HTTP "+status);try(InputStream in=c.getInputStream();ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] b=new byte[16384];int n;while((n=in.read(b))>0){if(out.size()+n>limit)throw new IOException("cover too large");out.write(b,0,n);}byte[] data=out.toByteArray();Bitmap bitmap=BitmapFactory.decodeByteArray(data,0,data.length);if(bitmap==null)throw new IOException("invalid cover");return bitmap;}}
    private static void save(Context context,String cacheKey,Bitmap bitmap){File target=disk(context,cacheKey),tmp=null;try{tmp=File.createTempFile("cover-",".tmp",target.getParentFile());try(OutputStream out=new FileOutputStream(tmp)){if(!bitmap.compress(Bitmap.CompressFormat.JPEG,88,out))throw new IOException("compress failed");}if(target.exists()&&!target.delete())throw new IOException("replace failed");if(!tmp.renameTo(target))throw new IOException("rename failed");trim(context,target);}catch(Exception ignored){if(tmp!=null)tmp.delete();}}
    private static synchronized void trim(Context context,File active){File[] files=dir(context).listFiles();if(files==null)return;Arrays.sort(files,Comparator.comparingLong(File::lastModified));long total=0;for(File f:files)if(f.isFile())total+=f.length();long limit=StorageSettings.coverLimitBytes(context);if(limit==Long.MAX_VALUE)return;for(File f:files)if(total>limit&&f.isFile()&&!f.equals(active)){long n=f.length();if(f.delete())total-=n;}}
    static long diskBytes(Context context){File[] files=dir(context).listFiles();long total=0;if(files!=null)for(File f:files)if(f.isFile())total+=f.length();return total;}
    static void clear(Context context){File[] files=dir(context).listFiles();if(files!=null)for(File f:files)f.delete();synchronized(MEMORY){MEMORY.evictAll();}}
}
