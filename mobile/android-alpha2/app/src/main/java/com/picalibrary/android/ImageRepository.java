package com.picalibrary.android;

import android.app.Activity;
import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.drawable.ColorDrawable;
import android.util.LruCache;
import android.widget.ImageView;
import java.io.*;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.Comparator;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

final class ImageRepository {
    private static final int MAX_BYTES = 72 * 1024 * 1024;
    private static final LruCache<String, Bitmap> CACHE = new LruCache<String, Bitmap>(MAX_BYTES) {
        @Override protected int sizeOf(String key, Bitmap value) { return value.getByteCount(); }
    };
    private static final ExecutorService POOL = Executors.newFixedThreadPool(6);

    private ImageRepository() {}

    static Bitmap cached(String path) { synchronized (CACHE) { return CACHE.get(path); } }
    static void put(String path, Bitmap bitmap) { if (path == null || bitmap == null) return; synchronized (CACHE) { CACHE.put(path, bitmap); } }

    private static String key(String path){
        try{byte[] digest=MessageDigest.getInstance("SHA-256").digest(path.getBytes(java.nio.charset.StandardCharsets.UTF_8));StringBuilder b=new StringBuilder();for(byte v:digest)b.append(String.format(java.util.Locale.ROOT,"%02x",v));return b.toString();}
        catch(Exception e){return Integer.toHexString(path.hashCode());}
    }
    private static File dir(Context context){return MobileStoragePaths.cacheDir(context,"desktop-cover-cache-v1");}
    private static File disk(Context context,String path){return new File(dir(context),key(path));}
    private static Bitmap diskHit(Context context,String path){File f=disk(context,path);if(!f.isFile())return null;Bitmap b=BitmapFactory.decodeFile(f.getPath());if(b==null){f.delete();return null;}f.setLastModified(System.currentTimeMillis());return b;}
    private static void saveDisk(Context context,String path,Bitmap bitmap){
        File target=disk(context,path),tmp=null;try{tmp=File.createTempFile("cover-",".tmp",target.getParentFile());try(OutputStream out=new FileOutputStream(tmp)){if(!bitmap.compress(Bitmap.CompressFormat.JPEG,88,out))throw new IOException("compress failed");}if(target.exists()&&!target.delete())throw new IOException("replace failed");if(!tmp.renameTo(target))throw new IOException("rename failed");trim(context,target);}catch(Exception ignored){if(tmp!=null)tmp.delete();}
    }
    private static synchronized void trim(Context context,File active){File[] files=dir(context).listFiles();if(files==null)return;Arrays.sort(files,Comparator.comparingLong(File::lastModified));long total=0;for(File f:files)total+=f.length();long limit=StorageSettings.coverLimitBytes(context);for(File f:files)if(limit!=Long.MAX_VALUE&&total>limit&&!f.equals(active)){long n=f.length();if(f.delete())total-=n;}}

    static Bitmap cacheNow(Context context,String path){
        if(path==null||path.isEmpty())return null;Bitmap hit=cached(path);if(hit!=null)return hit;hit=diskHit(context,path);if(hit!=null){put(path,hit);return hit;}
        try{Bitmap bitmap=BridgeClient.bitmap(context,path);put(path,bitmap);saveDisk(context,path,bitmap);return bitmap;}catch(Exception e){return null;}
    }

    static void load(Activity activity, ImageView target, String path, int placeholderColor) {
        if (path == null || path.isEmpty()) { target.setImageDrawable(new ColorDrawable(placeholderColor)); return; }
        target.setTag(path);Bitmap hit = cached(path);if (hit == null) hit=diskHit(activity,path);
        if (hit != null) { put(path,hit);target.setImageBitmap(hit);return; }
        target.setImageDrawable(new ColorDrawable(placeholderColor));
        POOL.submit(() -> {Bitmap bitmap=cacheNow(activity,path);if(bitmap==null)return;activity.runOnUiThread(() -> {Object tag = target.getTag();if (tag != null && path.equals(tag.toString())) target.setImageBitmap(bitmap);});});
    }

    static void prefetch(Activity activity, String path) { if (path == null || path.isEmpty() || cached(path) != null || disk(activity,path).isFile()) return; POOL.submit(() -> cacheNow(activity,path)); }
    static long diskBytes(Context context){File[] files=dir(context).listFiles();long total=0;if(files!=null)for(File f:files)total+=f.length();return total;}
    static void clearDisk(Context context){File[] files=dir(context).listFiles();if(files!=null)for(File f:files)f.delete();synchronized(CACHE){CACHE.evictAll();}}
}
