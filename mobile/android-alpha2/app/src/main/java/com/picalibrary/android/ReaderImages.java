package com.picalibrary.android;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import java.io.*;
import java.net.HttpURLConnection;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;

/** Persistent encoded-page cache shared by Desktop/WebDAV/Pica; phone downloads bypass network. */
final class ReaderImages implements AutoCloseable {
    interface Callback { void complete(Bitmap bitmap); void failed(); }
    static final class Request {
        volatile boolean cancelled;
        volatile HttpURLConnection connection;
        Future<?> future;
        void cancel() { cancelled = true; if (connection != null) connection.disconnect(); if (future != null) future.cancel(true); }
    }
    private final ExecutorService workers = Executors.newFixedThreadPool(4);
    private final ExecutorService prefetchers = Executors.newFixedThreadPool(2);
    private final Handler main = new Handler(Looper.getMainLooper());
    private final AtomicInteger prefetchGeneration = new AtomicInteger();
    private final File cache;
    private final ReaderSource source;
    private final Context context;
    private volatile boolean closed;
    private static final String ROOT = "reader-pages-v2";

    ReaderImages(Context context, ReaderSource source) {this.context=context.getApplicationContext();this.source = source;cache = MobileStoragePaths.cacheDir(this.context, ROOT + "/" + source.scope());}

    Request load(String path, int width, Callback callback) {
        Request request = new Request();request.future = workers.submit(() -> {File target = new File(cache, ReaderPolicy.hash(path));File partial = null;
            try {if (!target.isFile()) {partial = fetchToPartial(path, request);validateImage(partial);synchronized (ReaderImages.class) { if (!target.exists() && !partial.renameTo(target)) throw new IOException("cache rename failed"); }}if (request.cancelled || closed) return;
                BitmapFactory.Options options = new BitmapFactory.Options(); options.inJustDecodeBounds = true;BitmapFactory.decodeFile(target.getPath(), options);options.inSampleSize = ReaderPolicy.sampleSize(options.outWidth, options.outHeight, width);options.inJustDecodeBounds = false;Bitmap bitmap = BitmapFactory.decodeFile(target.getPath(), options);if (bitmap == null) { target.delete(); throw new IOException("decode failed"); }target.setLastModified(System.currentTimeMillis());main.post(() -> { if (!request.cancelled && !closed) callback.complete(bitmap); else bitmap.recycle(); });trim(target);
            } catch (Exception | OutOfMemoryError e) { main.post(() -> { if (!request.cancelled && !closed) callback.failed(); }); }finally { if (partial != null) partial.delete(); }});return request;
    }

    void prefetch(List<String> paths) {
        final int generation=prefetchGeneration.incrementAndGet();for(String path:paths){if(path==null||path.isEmpty())continue;File target=new File(cache,ReaderPolicy.hash(path));if(target.isFile())continue;prefetchers.submit(()->{if(closed||generation!=prefetchGeneration.get())return;Request request=new Request();File partial=null;try{partial=fetchToPartial(path,request);if(closed||generation!=prefetchGeneration.get())return;validateImage(partial);synchronized(ReaderImages.class){if(!target.exists()&&!partial.renameTo(target))throw new IOException("cache rename failed");}target.setLastModified(System.currentTimeMillis());trim(target);}catch(Exception ignored){}finally{if(partial!=null)partial.delete();}});}
    }

    private File fetchToPartial(String path,Request request) throws Exception {
        File partial=File.createTempFile("page-",".part",cache);
        try{
            if(path!=null&&(path.startsWith("content://")||path.startsWith("file://"))){try(InputStream in=openLocal(path);OutputStream out=new FileOutputStream(partial)){copy(in,out,request);}return partial;}
            HttpURLConnection connection=source.image(path);request.connection=connection;try{if(request.cancelled||closed)throw new IOException("cancelled");int status=connection.getResponseCode();if(status!=200)throw new IOException("HTTP "+status);try(InputStream in=connection.getInputStream();OutputStream out=new FileOutputStream(partial)){copy(in,out,request);}return partial;}finally{connection.disconnect();request.connection=null;}
        }catch(Exception e){partial.delete();throw e;}
    }
    private InputStream openLocal(String value) throws Exception {Uri uri=Uri.parse(value);if("content".equalsIgnoreCase(uri.getScheme())){InputStream in=context.getContentResolver().openInputStream(uri);if(in==null)throw new FileNotFoundException("手机下载页面不可读");return in;}if("file".equalsIgnoreCase(uri.getScheme()))return new FileInputStream(new File(uri.getPath()));throw new FileNotFoundException("不支持的本地页面地址");}
    private void copy(InputStream in,OutputStream out,Request request) throws Exception {byte[] buffer=new byte[32768];int n;long bytes=0;while((n=in.read(buffer))!=-1){if(request.cancelled||closed||Thread.currentThread().isInterrupted())throw new IOException("cancelled");bytes+=n;if(bytes>64L*1024*1024)throw new IOException("page too large");out.write(buffer,0,n);}}
    private static void validateImage(File file) throws IOException {BitmapFactory.Options bounds=new BitmapFactory.Options();bounds.inJustDecodeBounds=true;BitmapFactory.decodeFile(file.getPath(),bounds);if(bounds.outWidth<=0||bounds.outHeight<=0)throw new IOException("invalid image");}

    private synchronized void trim(File active) {File root=cache.getParentFile();File[] scopes=root==null?null:root.listFiles(File::isDirectory);if(scopes==null)return;ArrayList<File> files=new ArrayList<>();for(File scope:scopes){File[] nested=scope.listFiles(file -> file.isFile()&&!file.getName().endsWith(".part"));if(nested!=null)files.addAll(Arrays.asList(nested));}files.sort(Comparator.comparingLong(File::lastModified));long total=0;for(File file:files)total+=file.length();long limit=StorageSettings.pageLimitBytes(context);for(File file:files)if(limit!=Long.MAX_VALUE&&total>limit&&!file.equals(active)){long n=file.length();if(file.delete())total-=n;}}

    static long cacheBytes(Context context){return bytes(new File(MobileStoragePaths.cacheRoot(context),ROOT));}
    private static long bytes(File file){if(file==null||!file.exists())return 0;if(file.isFile())return file.length();long total=0;File[] children=file.listFiles();if(children!=null)for(File child:children)total+=bytes(child);return total;}
    static void clearCache(Context context){delete(new File(MobileStoragePaths.cacheRoot(context),ROOT));}
    private static void delete(File file){if(file==null||!file.exists())return;if(file.isDirectory()){File[] children=file.listFiles();if(children!=null)for(File child:children)delete(child);}file.delete();}
    public void close() { closed = true;prefetchGeneration.incrementAndGet();workers.shutdownNow();prefetchers.shutdownNow(); }
}
