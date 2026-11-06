package com.picalibrary.android;

import android.content.Context;
import android.net.Uri;
import android.util.AtomicFile;
import android.util.Log;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.*;
import org.json.*;

/** Persistent index for explicit phone downloads. Only fully readable indexed chapters are exposed to Reader. */
final class PhoneDownloadStore {
    static final class Page {final int position;final String uri;Page(int position,String uri){this.position=position;this.uri=uri;}}
    static final class Chapter {final String id,title;final int order;final List<Page> pages;Chapter(String id,String title,int order,List<Page> pages){this.id=id;this.title=title;this.order=order;this.pages=pages;}}
    static final class Comic {final String id,title,author;final List<Chapter> chapters;Comic(String id,String title,String author,List<Chapter> chapters){this.id=id;this.title=title;this.author=author;this.chapters=chapters;}int pages(){int n=0;for(Chapter c:chapters)n+=c.pages.size();return n;}}
    static final class Snapshot {
        final LinkedHashMap<String,Comic> comics=new LinkedHashMap<>();
        boolean readError;
        String readErrorMessage="";
    }
    private PhoneDownloadStore(){}
    private static File file(Context c){return MobileStoragePaths.dataFile(c,"phone-download-index-v1.json");}

    /**
     * Reader/UI may show an empty view for a damaged index, but the snapshot is
     * explicitly marked unreadable. Every mutation must use loadVerified() and
     * fail before changing any file or catalog flags.
     */
    static synchronized Snapshot load(Context context){
        try{return loadVerified(context);}
        catch(Exception e){
            Snapshot unavailable=new Snapshot();
            unavailable.readError=true;
            unavailable.readErrorMessage="手机下载索引暂不可读取，原文件已保留";
            Log.e("PhoneDownloadStore","Index preserved; edits disabled",e);
            return unavailable;
        }
    }

    private static Snapshot loadVerified(Context context){
        Snapshot snapshot=new Snapshot();
        File target=file(context);
        File backup=new File(target.getPath()+".bak");
        if(!target.exists()&&!backup.exists()){
            // The previous writer used .tmp. Do not mistake its interrupted
            // replacement for a fresh install and erase a recoverable index.
            if(new File(target.getPath()+".tmp").exists()||new File(target.getPath()+".new").exists())
                throw new IllegalStateException("下载索引有未完成的写入，请先备份");
            return snapshot;
        }
        try(InputStream in=new AtomicFile(target).openRead();
            ByteArrayOutputStream out=new ByteArrayOutputStream()){
            byte[] buffer=new byte[16384];int n;
            while((n=in.read(buffer))>0)out.write(buffer,0,n);
            JSONObject root=new JSONObject(out.toString("UTF-8"));
            if(root.optInt("schemaVersion",-1)!=1)
                throw new IOException("不支持的手机下载索引版本");
            JSONArray comics=root.optJSONArray("comics");
            if(comics==null)throw new IOException("手机下载索引缺少作品列表");
            for(int i=0;i<comics.length();i++){
                Comic comic=parse(comics.optJSONObject(i));
                if(comic==null||snapshot.comics.putIfAbsent(comic.id,comic)!=null)
                    throw new IOException("手机下载索引中存在无效或重复的作品");
            }
            return snapshot;
        }catch(Exception e){throw new IllegalStateException("手机下载索引无法读取；已禁止覆盖原文件",e);}
    }
    static synchronized Comic comic(Context context,String id){return load(context).comics.get(id);}
    static synchronized boolean has(Context context,String id){Comic comic=load(context).comics.get(id);if(comic==null)return false;for(Chapter chapter:comic.chapters)if(chapterReadable(context,chapter))return true;return false;}
    static boolean chapterReadable(Context context,Chapter chapter){if(chapter==null||chapter.pages.isEmpty())return false;for(Page page:chapter.pages)if(!readable(context,page.uri))return false;return true;}
    static int completePages(Context context,Comic comic){if(comic==null)return 0;int total=0;for(Chapter chapter:comic.chapters)if(chapterReadable(context,chapter))total+=chapter.pages.size();return total;}

    static synchronized void put(Context context,Comic comic){Snapshot s=loadVerified(context);s.comics.put(comic.id,comic);save(context,s);reconcileCatalog(context);}
    static synchronized void putChapter(Context context,String comicId,String title,String author,Chapter chapter){Snapshot s=loadVerified(context);Comic prior=s.comics.get(comicId);List<Chapter> chapters=new ArrayList<>();if(prior!=null)chapters.addAll(prior.chapters);chapters.removeIf(c->c.id.equals(chapter.id));chapters.add(chapter);chapters.sort(Comparator.comparingInt(c->c.order));s.comics.put(comicId,new Comic(comicId,title,author,chapters));save(context,s);reconcileCatalog(context);}
    static synchronized void remove(Context context,String id){
        Snapshot s=loadVerified(context);
        Comic comic=s.comics.remove(id);
        // The index must commit before deleting any downloaded file. Failure
        // to write leaves the previously indexed downloaded pages untouched.
        save(context,s);
        if(comic!=null)for(Chapter chapter:comic.chapters)
            for(Page page:chapter.pages)deleteUri(context,page.uri);
        reconcileCatalog(context);
    }

    static String indexedUri(Context context,String comicId,String episodeId,int position){Comic comic=comic(context,comicId);if(comic==null)return "";for(Chapter chapter:comic.chapters)if(chapter.id.equals(episodeId))for(Page page:chapter.pages)if(page.position==position&&readable(context,page.uri))return page.uri;return "";}
    static boolean readable(Context context,String value){if(value==null||value.isEmpty())return false;try{Uri uri=Uri.parse(value);if("file".equalsIgnoreCase(uri.getScheme())){File f=new File(uri.getPath());return f.isFile()&&f.length()>0;}try(android.os.ParcelFileDescriptor pfd=context.getContentResolver().openFileDescriptor(uri,"r")){return pfd!=null&&pfd.getStatSize()!=0;}}catch(Exception e){return false;}}
    static long estimatedBytes(Context context,Snapshot snapshot){long total=0;if(snapshot==null)return total;for(Comic comic:snapshot.comics.values())for(Chapter chapter:comic.chapters)for(Page page:chapter.pages)try{Uri uri=Uri.parse(page.uri);if("file".equals(uri.getScheme()))total+=new File(uri.getPath()).length();else try(android.os.ParcelFileDescriptor pfd=context.getContentResolver().openFileDescriptor(uri,"r")){if(pfd!=null&&pfd.getStatSize()>0)total+=pfd.getStatSize();}}catch(Exception ignored){}return total;}
    static synchronized long estimatedBytes(Context context){return estimatedBytes(context,load(context));}

    static synchronized void reconcileCatalog(Context context){
        // Never silently clear ownership flags when the underlying index is unreadable.
        Snapshot indexed=loadVerified(context);
        UnifiedCatalogStore.Snapshot catalog=UnifiedCatalogStore.load(context);
        for(UnifiedCatalogStore.Entry entry:catalog.byId.values())entry.phoneDownloaded=false;
        for(Comic comic:indexed.comics.values()){int readablePages=completePages(context,comic);UnifiedCatalogStore.Entry entry=catalog.byId.get(comic.id);if(entry==null){entry=new UnifiedCatalogStore.Entry(comic.id,comic.title,comic.author);catalog.byId.put(comic.id,entry);}entry.phoneDownloaded=readablePages>0;entry.knownPictures=Math.max(entry.knownPictures,readablePages);}UnifiedCatalogStore.save(context,catalog);}

    private static void save(Context context,Snapshot s){
        AtomicFile atomic=null;
        FileOutputStream stream=null;
        try{
            JSONObject root=new JSONObject();
            root.put("schemaVersion",1);
            root.put("updatedAt",Instant.now().toString());
            JSONArray comics=new JSONArray();
            for(Comic comic:s.comics.values()){
                JSONObject o=new JSONObject();o.put("id",comic.id);o.put("title",comic.title);o.put("author",comic.author);
                JSONArray chapters=new JSONArray();
                for(Chapter chapter:comic.chapters){
                    JSONObject c=new JSONObject();c.put("id",chapter.id);c.put("title",chapter.title);c.put("order",chapter.order);
                    JSONArray pages=new JSONArray();
                    for(Page page:chapter.pages){
                        JSONObject p=new JSONObject();p.put("position",page.position);p.put("uri",page.uri);pages.put(p);
                    }
                    c.put("pages",pages);chapters.put(c);
                }
                o.put("chapters",chapters);comics.put(o);
            }
            root.put("comics",comics);
            File target=file(context);
            File parent=target.getParentFile();
            if(!parent.isDirectory()&&!parent.mkdirs())throw new IOException("无法创建手机下载索引目录");
            // AtomicFile retains/restores the previous index when writing fails.
            // Do not delete or rename the old version before the new one commits.
            atomic=new AtomicFile(target);
            stream=atomic.startWrite();
            stream.write(root.toString().getBytes(StandardCharsets.UTF_8));
            atomic.finishWrite(stream);
            stream=null;
        }catch(Exception e){
            if(atomic!=null&&stream!=null)atomic.failWrite(stream);
            throw new IllegalStateException("无法保存手机下载索引，原数据保留",e);
        }
    }
    private static Comic parse(JSONObject o){if(o==null)return null;String id=o.optString("id","");if(id.isEmpty())return null;List<Chapter> chapters=new ArrayList<>();JSONArray arr=o.optJSONArray("chapters");if(arr!=null)for(int i=0;i<arr.length();i++){JSONObject c=arr.optJSONObject(i);if(c==null)continue;List<Page> pages=new ArrayList<>();JSONArray pa=c.optJSONArray("pages");if(pa!=null)for(int j=0;j<pa.length();j++){JSONObject p=pa.optJSONObject(j);if(p!=null&&!p.optString("uri","").isEmpty())pages.add(new Page(p.optInt("position",j),p.optString("uri")));}pages.sort(Comparator.comparingInt(p->p.position));chapters.add(new Chapter(c.optString("id","chapter-"+i),c.optString("title","章节"),c.optInt("order",i+1),pages));}chapters.sort(Comparator.comparingInt(c->c.order));return new Comic(id,o.optString("title","未命名漫画"),o.optString("author","未知作者"),chapters);}
    private static void deleteUri(Context context,String value){try{Uri uri=Uri.parse(value);if("file".equals(uri.getScheme()))new File(uri.getPath()).delete();else context.getContentResolver().delete(uri,null,null);}catch(Exception ignored){}}
}