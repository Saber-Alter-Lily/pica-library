package com.picalibrary.android;

import android.content.Context;
import android.net.Uri;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.*;
import org.json.*;

/** Persistent index for user-requested phone downloads. These files are not cache and never enter LRU eviction. */
final class PhoneDownloadStore {
    static final class Page {final int position;final String uri;Page(int position,String uri){this.position=position;this.uri=uri;}}
    static final class Chapter {final String id,title;final int order;final List<Page> pages;Chapter(String id,String title,int order,List<Page> pages){this.id=id;this.title=title;this.order=order;this.pages=pages;}}
    static final class Comic {final String id,title,author;final List<Chapter> chapters;Comic(String id,String title,String author,List<Chapter> chapters){this.id=id;this.title=title;this.author=author;this.chapters=chapters;}int pages(){int n=0;for(Chapter c:chapters)n+=c.pages.size();return n;}}
    static final class Snapshot {final LinkedHashMap<String,Comic> comics=new LinkedHashMap<>();}
    private PhoneDownloadStore(){}
    private static File file(Context c){return MobileStoragePaths.dataFile(c,"phone-download-index-v1.json");}

    static synchronized Snapshot load(Context context){Snapshot snapshot=new Snapshot();File f=file(context);if(!f.isFile())return snapshot;try(InputStream in=new FileInputStream(f);ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] b=new byte[16384];int n;while((n=in.read(b))>0)out.write(b,0,n);JSONObject root=new JSONObject(out.toString("UTF-8"));JSONArray comics=root.optJSONArray("comics");if(comics!=null)for(int i=0;i<comics.length();i++){JSONObject o=comics.optJSONObject(i);Comic comic=parse(o);if(comic!=null)snapshot.comics.put(comic.id,comic);}return snapshot;}catch(Exception e){return snapshot;}}
    static synchronized void put(Context context,Comic comic){Snapshot snapshot=load(context);snapshot.comics.put(comic.id,comic);save(context,snapshot);reconcileCatalog(context);}
    static synchronized Comic comic(Context context,String id){return load(context).comics.get(id);}
    static synchronized boolean has(Context context,String id){Comic c=load(context).comics.get(id);return c!=null&&!c.chapters.isEmpty()&&c.pages()>0;}
    static synchronized void remove(Context context,String id){Snapshot snapshot=load(context);Comic comic=snapshot.comics.remove(id);if(comic!=null)for(Chapter chapter:comic.chapters)for(Page page:chapter.pages)deleteUri(context,page.uri);save(context,snapshot);reconcileCatalog(context);}
    static synchronized long estimatedBytes(Context context){long total=0;for(Comic comic:load(context).comics.values())for(Chapter chapter:comic.chapters)for(Page page:chapter.pages)try{Uri uri=Uri.parse(page.uri);if("file".equals(uri.getScheme()))total+=new File(uri.getPath()).length();else try(android.os.ParcelFileDescriptor pfd=context.getContentResolver().openFileDescriptor(uri,"r")){if(pfd!=null&&pfd.getStatSize()>0)total+=pfd.getStatSize();}}catch(Exception ignored){}return total;}

    static synchronized void reconcileCatalog(Context context){UnifiedCatalogStore.Snapshot catalog=UnifiedCatalogStore.load(context);for(UnifiedCatalogStore.Entry entry:catalog.byId.values())entry.phoneDownloaded=false;for(Comic comic:load(context).comics.values()){UnifiedCatalogStore.Entry entry=catalog.byId.get(comic.id);if(entry==null){entry=new UnifiedCatalogStore.Entry(comic.id,comic.title,comic.author);catalog.byId.put(comic.id,entry);}entry.phoneDownloaded=comic.pages()>0;entry.knownPictures=Math.max(entry.knownPictures,comic.pages());}UnifiedCatalogStore.save(context,catalog);}

    private static void save(Context context,Snapshot snapshot){try{JSONObject root=new JSONObject();root.put("schemaVersion",1);root.put("updatedAt",Instant.now().toString());JSONArray comics=new JSONArray();for(Comic comic:snapshot.comics.values()){JSONObject o=new JSONObject();o.put("id",comic.id);o.put("title",comic.title);o.put("author",comic.author);JSONArray chapters=new JSONArray();for(Chapter chapter:comic.chapters){JSONObject c=new JSONObject();c.put("id",chapter.id);c.put("title",chapter.title);c.put("order",chapter.order);JSONArray pages=new JSONArray();for(Page page:chapter.pages){JSONObject p=new JSONObject();p.put("position",page.position);p.put("uri",page.uri);pages.put(p);}c.put("pages",pages);chapters.put(c);}o.put("chapters",chapters);comics.put(o);}root.put("comics",comics);File target=file(context);target.getParentFile().mkdirs();File tmp=new File(target.getParentFile(),target.getName()+".tmp");try(OutputStream out=new FileOutputStream(tmp)){out.write(root.toString().getBytes(StandardCharsets.UTF_8));}if(target.exists()&&!target.delete())throw new IOException("replace phone index failed");if(!tmp.renameTo(target))throw new IOException("rename phone index failed");}catch(Exception e){throw new IllegalStateException("无法保存手机下载索引",e);}}
    private static Comic parse(JSONObject o){if(o==null)return null;String id=o.optString("id","");if(id.isEmpty())return null;List<Chapter> chapters=new ArrayList<>();JSONArray arr=o.optJSONArray("chapters");if(arr!=null)for(int i=0;i<arr.length();i++){JSONObject c=arr.optJSONObject(i);if(c==null)continue;List<Page> pages=new ArrayList<>();JSONArray pa=c.optJSONArray("pages");if(pa!=null)for(int j=0;j<pa.length();j++){JSONObject p=pa.optJSONObject(j);if(p!=null&&!p.optString("uri","").isEmpty())pages.add(new Page(p.optInt("position",j),p.optString("uri")));}chapters.add(new Chapter(c.optString("id","chapter-"+i),c.optString("title","章节"),c.optInt("order",i+1),pages));}return new Comic(id,o.optString("title","未命名漫画"),o.optString("author","未知作者"),chapters);}
    private static void deleteUri(Context context,String value){try{Uri uri=Uri.parse(value);if("file".equals(uri.getScheme())){new File(uri.getPath()).delete();}else context.getContentResolver().delete(uri,null,null);}catch(Exception ignored){}}
}
