package com.picalibrary.android;

import android.content.Context;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.util.AtomicFile;
import androidx.documentfile.provider.DocumentFile;
import com.picalibrary.android.local.LocalComicImporter;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.*;
import org.json.*;

/** Android SAF adapter + app-owned generation/manifest storage, separate from disposable caches. */
final class LocalComicStore {
    static final class Preview implements AutoCloseable {
        final String id,title,kind;
        final LocalComicImporter.Prepared prepared;
        final File work;
        boolean committed;
        Preview(String id,String title,String kind,LocalComicImporter.Prepared prepared,File work){this.id=id;this.title=title;this.kind=kind;this.prepared=prepared;this.work=work;}
        @Override public void close(){removeOwned(work.getParentFile(),work);}
    }
    static final class Page {
        final String id,chapterId,chapterTitle,name,file;
        final long bytes;
        Page(JSONObject row) throws JSONException {id=row.getString("id");chapterId=row.getString("chapterId");chapterTitle=row.getString("chapterTitle");name=row.getString("name");file=row.getString("file");bytes=row.getLong("bytes");}
    }
    static final class Comic {
        final String id,title,kind,generation,updatedAt;
        final List<Page> pages=new ArrayList<>();
        Comic(JSONObject root) throws Exception {
            if(root.getInt("schemaVersion")!=1)throw new IOException("Unsupported local comic manifest");
            id=root.getString("id");title=root.getString("title");kind=root.getString("kind");generation=root.getString("generation");updatedAt=root.getString("updatedAt");
            if(!id.matches("local:[0-9a-f]{64}")||!generation.matches("g-[0-9a-f-]{36}")||!("folder".equals(kind)||"cbz".equals(kind)))throw new IOException("Invalid local comic identity");
            JSONArray rows=root.getJSONArray("pages");if(rows.length()==0||rows.length()>LocalComicImporter.MAX_PAGES)throw new IOException("Invalid local page count");
            Set<String> names=new HashSet<>();long bytes=0;
            for(int i=0;i<rows.length();i++){
                Page page=new Page(rows.getJSONObject(i));String name=LocalComicImporter.safeName(page.name);int slash=name.lastIndexOf('/');String chapter="local-chapter:"+LocalComicImporter.hash(slash<0?"":name.substring(0,slash));
                if(!page.file.matches("[0-9a-f]{64}\\.(jpg|jpeg|png|gif|webp)")||!page.file.startsWith(LocalComicImporter.hash(name)+".")||!page.id.equals("local-page:"+LocalComicImporter.hash(name))||!page.chapterId.equals(chapter)||!names.add(name.toLowerCase(Locale.ROOT))||page.bytes<1||page.bytes>LocalComicImporter.MAX_PAGE)throw new IOException("Invalid local page metadata");
                bytes+=page.bytes;if(bytes>LocalComicImporter.MAX_TOTAL)throw new IOException("Invalid local comic byte count");pages.add(page);
            }
        }
    }
    private LocalComicStore(){}
    // Deliberately pinned internal. Changing cache/data preferences never strands owned comic bodies.
    static File root(Context c){return new File(c.getFilesDir(),"local-comics-v1");}
    private static File comicRoot(Context c,String id) throws IOException {if(id==null||!id.matches("local:[0-9a-f]{64}"))throw new IOException("Invalid local comic id");return inside(root(c),new File(root(c),id.substring(6)));}
    private static File inside(File root,File target) throws IOException {String base=root.getCanonicalPath()+File.separator;if(!target.getCanonicalPath().startsWith(base)||!target.getAbsoluteFile().equals(target.getCanonicalFile()))throw new IOException("Unsafe owned comic path");return target;}
    static void removeOwned(File parent,File target){try{inside(parent,target);deleteTree(target);}catch(IOException ignored){}}
    private static void deleteTree(File file) throws IOException {
        // Never follow links; every descendant must still resolve to exactly its lexical location.
        if(!file.getAbsoluteFile().equals(file.getCanonicalFile()))throw new IOException("Owned comic link rejected");
        if(file.isDirectory()){File[] children=file.listFiles();if(children==null)throw new IOException("Unreadable owned directory");for(File child:children)deleteTree(child);}
        if(file.exists()&&!file.delete())throw new IOException("Cannot remove owned comic file");
    }
    private static String title(String name){String value=name==null?"Local comic":name;if(value.toLowerCase(Locale.ROOT).matches(".*\\.(cbz|zip)$"))value=value.substring(0,value.lastIndexOf('.'));return value.trim().isEmpty()?"Local comic":value.substring(0,Math.min(200,value.length()));}
    static Preview prepare(Context context,Uri uri,String kind,LocalComicImporter.Cancellation cancel) throws Exception {
        if(uri==null||!"content".equals(uri.getScheme())||!("folder".equals(kind)||"cbz".equals(kind)))throw new IOException("Choose a local folder or CBZ with the system picker");
        Context app=context.getApplicationContext();DocumentFile selected="folder".equals(kind)?DocumentFile.fromTreeUri(app,uri):DocumentFile.fromSingleUri(app,uri);
        if(selected==null||!selected.canRead()||("folder".equals(kind)?!selected.isDirectory():!selected.isFile()))throw new IOException("Selected document is not readable");
        File stagingRoot=new File(app.getFilesDir(),"local-comic-staging-v1");if(!stagingRoot.isDirectory()&&!stagingRoot.mkdirs())throw new IOException("Cannot create import staging");
        File work=inside(stagingRoot,new File(stagingRoot,UUID.randomUUID().toString()));if(!work.mkdir())throw new IOException("Cannot create import session");
        try {
            String label=title(selected.getName());File pages=new File(work,"pages");if(!pages.mkdir())throw new IOException("Cannot stage pages");LocalComicImporter.Prepared prepared;
            if("folder".equals(kind)){
                List<LocalComicImporter.Input> inventory=new ArrayList<>();walk(app,selected,"",0,inventory,new HashSet<>(),cancel);
                prepared=LocalComicImporter.prepare(label,()->inventory,pages,cancel);
            } else {
                String filename=String.valueOf(selected.getName()).toLowerCase(Locale.ROOT);if(!(filename.endsWith(".cbz")||filename.endsWith(".zip")))throw new IOException("Choose a CBZ/ZIP comic, not CBR/PDF/EPUB");
                File archive=new File(work,"archive.cbz");
                try(InputStream in=app.getContentResolver().openInputStream(uri);FileOutputStream out=new FileOutputStream(archive)){
                    if(in==null)throw new IOException("Cannot read CBZ");byte[] buffer=new byte[32768];int n;long bytes=0;
                    while((n=in.read(buffer))!=-1){cancel.check();bytes+=n;if(bytes>LocalComicImporter.MAX_ARCHIVE)throw new IOException("CBZ exceeds 256 MiB");out.write(buffer,0,n);}out.getFD().sync();
                }
                try(LocalComicImporter.Source source=LocalComicImporter.zip(archive)){prepared=LocalComicImporter.prepare(label,source,pages,cancel);}
                if(!archive.delete())throw new IOException("Cannot remove staging archive");
            }
            for(LocalComicImporter.Page page:prepared.pages){cancel.check();BitmapFactory.Options bounds=new BitmapFactory.Options();bounds.inJustDecodeBounds=true;BitmapFactory.decodeFile(new File(pages,page.file).getPath(),bounds);if(bounds.outWidth<1||bounds.outHeight<1||bounds.outWidth>60000||bounds.outHeight>60000||(long)bounds.outWidth*bounds.outHeight>100000000L)throw new IOException("Invalid or oversized raster image");}
            cancel.check();return new Preview(LocalComicImporter.identity(DeviceIdentity.id(app),kind,uri.normalizeScheme().toString()),label,kind,prepared,work);
        } catch(Exception|OutOfMemoryError error){removeOwned(stagingRoot,work);throw error;}
    }
    private static void walk(Context context,DocumentFile directory,String prefix,int depth,List<LocalComicImporter.Input> out,Set<String> visited,LocalComicImporter.Cancellation cancel) throws IOException {
        cancel.check();if(depth>LocalComicImporter.MAX_DEPTH||!visited.add(directory.getUri().toString()))throw new IOException("Folder is too deep or cyclic");
        for(DocumentFile child:directory.listFiles()){
            cancel.check();if(out.size()>=LocalComicImporter.MAX_ENTRIES)throw new IOException("Too many folder entries");
            String childName=child.getName();if(childName==null||childName.contains("/"))throw new IOException("Invalid document name");String name=LocalComicImporter.safeName(prefix+childName);boolean folder=child.isDirectory();
            if(!folder&&!child.isFile())throw new IOException("Unsupported document type");
            out.add(new LocalComicImporter.Input(name,child.length()>0?child.length():-1,folder,()->context.getContentResolver().openInputStream(child.getUri())));
            if(folder)walk(context,child,name+"/",depth+1,out,visited,cancel);
        }
    }
    static synchronized Comic confirm(Context context,Preview preview,LocalComicImporter.Cancellation cancel) throws Exception {
        if(preview==null||preview.committed)throw new IOException("Import preview is no longer available");cancel.check();
        File directory=comicRoot(context,preview.id);if(!directory.isDirectory()&&!directory.mkdirs())throw new IOException("Cannot create owned comic");
        AtomicFile pointer=new AtomicFile(new File(directory,"manifest.json"));
        Comic old=read(context,preview.id); // Corrupt existing pointers fail closed rather than being replaced.
        String generation="g-"+UUID.randomUUID();File target=inside(directory,new File(directory,generation));
        JSONObject manifest=new JSONObject().put("schemaVersion",1).put("id",preview.id).put("title",old==null?preview.title:old.title).put("kind",preview.kind).put("generation",generation).put("updatedAt",Instant.now().toString());
        JSONArray pages=new JSONArray();for(LocalComicImporter.Page page:preview.prepared.pages)pages.put(new JSONObject().put("id",page.id).put("chapterId",page.chapterId).put("chapterTitle",page.chapterTitle).put("name",page.name).put("file",page.file).put("bytes",page.bytes));manifest.put("pages",pages);
        Comic next=new Comic(manifest);FileOutputStream out=null;boolean committed=false;
        try{
            cancel.check();if(!preview.prepared.directory.renameTo(target))throw new IOException("Cannot commit imported pages");
            cancel.check();out=pointer.startWrite();out.write(manifest.toString().getBytes(StandardCharsets.UTF_8));out.getFD().sync();cancel.check();pointer.finishWrite(out);out=null;committed=true;preview.committed=true;
            return next;
        } finally {if(!committed){if(out!=null)pointer.failWrite(out);removeOwned(directory,target);}preview.close();}
    }
    static synchronized Comic read(Context c,String id) throws Exception {
        File dir=comicRoot(c,id);AtomicFile file=new AtomicFile(new File(dir,"manifest.json"));
        if(!file.getBaseFile().exists()&&!new File(dir,"manifest.json.bak").exists())return null;
        try(InputStream in=file.openRead();ByteArrayOutputStream out=new ByteArrayOutputStream()){
            byte[] buffer=new byte[16384];int n;while((n=in.read(buffer))!=-1){if(out.size()+n>4*1024*1024)throw new IOException("Local manifest exceeds bound");out.write(buffer,0,n);}Comic comic=new Comic(new JSONObject(out.toString("UTF-8")));if(!comic.id.equals(id))throw new IOException("Local manifest identity mismatch");return comic;
        }
    }
    static List<Comic> list(Context c){ArrayList<Comic> values=new ArrayList<>();File[] dirs=root(c).listFiles(File::isDirectory);if(dirs!=null)for(File dir:dirs)if(dir.getName().matches("[0-9a-f]{64}"))try{Comic comic=read(c,"local:"+dir.getName());if(comic!=null)values.add(comic);}catch(Exception ignored){}return values;}
    static boolean has(Context c,String id){if(id==null||!id.startsWith("local:"))return false;try{return read(c,id)!=null;}catch(Exception ignored){return false;}}
    static File pageFile(Context c,Comic comic,Page page) throws IOException {File directory=comicRoot(c,comic.id);File file=inside(directory,new File(new File(directory,comic.generation),page.file));if(!file.isFile()||file.length()!=page.bytes)throw new IOException("Imported page is missing; reimport the original comic");return file;}
    static File cover(Context c,String id){try{Comic comic=read(c,id);return comic==null?null:pageFile(c,comic,comic.pages.get(0));}catch(Exception e){return null;}}
    static synchronized void remove(Context c,String id) throws Exception {
        File directory=comicRoot(c,id);if(read(c,id)==null)return;
        // Hide the manifest atomically before deleting only this app-owned comic directory.
        File trash=inside(root(c),new File(root(c),"removed-"+UUID.randomUUID()));if(!directory.renameTo(trash))throw new IOException("Cannot remove imported copy");deleteTree(trash);
    }
}
